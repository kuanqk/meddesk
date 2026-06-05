import decimal

from django.db import models

from apps.accounts.models import User
from apps.staff.models import StaffMember


class MacDentSync(models.Model):
    """Лог синхронизаций с MacDent API."""

    STATUS_CHOICES = [
        ("running", "В процессе"),
        ("success", "Успешно"),
        ("error", "Ошибка"),
    ]

    synced_at = models.DateTimeField(auto_now_add=True)
    period_from = models.DateField("Период с")
    period_to = models.DateField("Период по")
    status = models.CharField("Статус", max_length=20, choices=STATUS_CHOICES)
    records_saved = models.IntegerField("Сохранено записей", default=0)
    error_message = models.TextField("Ошибка", blank=True)
    raw_response = models.JSONField("Ответ API", null=True, blank=True)

    class Meta:
        verbose_name = "Синхронизация MacDent"
        verbose_name_plural = "Синхронизации MacDent"
        ordering = ["-synced_at"]

    def __str__(self):
        return f"Sync {self.period_from}–{self.period_to} [{self.status}]"


class DoctorRevenue(models.Model):
    """Оборот врача за день — источник MacDent или ручной ввод."""

    SOURCE_CHOICES = [
        ("macdent", "MacDent API"),
        ("manual", "Ручной ввод"),
        ("excel", "Импорт Excel"),
    ]

    doctor = models.ForeignKey(
        StaffMember,
        on_delete=models.CASCADE,
        related_name="revenues",
        verbose_name="Врач",
    )
    date = models.DateField("Дата")
    revenue = models.DecimalField(
        "Выручка", max_digits=14, decimal_places=2, default=0
    )
    hours_worked = models.DecimalField(
        "Часов отработано", max_digits=6, decimal_places=2, default=0
    )
    patients_count = models.IntegerField("Пациентов", default=0)
    source = models.CharField(
        "Источник", max_length=20, choices=SOURCE_CHOICES, default="macdent"
    )
    raw_data = models.JSONField("Исходные данные", null=True, blank=True)

    class Meta:
        verbose_name = "Выручка врача"
        verbose_name_plural = "Выручка врачей"
        unique_together = ["doctor", "date"]
        ordering = ["-date"]

    def __str__(self):
        return f"{self.doctor.name} — {self.date} — {self.revenue} тг"

    @property
    def revenue_per_hour(self):
        if self.hours_worked:
            return self.revenue / self.hours_worked
        return 0


class PayrollCalculation(models.Model):
    """Расчёт ФОТ сотрудника за месяц."""

    staff_member = models.ForeignKey(
        StaffMember,
        on_delete=models.CASCADE,
        related_name="payrolls",
        verbose_name="Сотрудник",
    )
    period = models.DateField("Период (первый день месяца)")
    revenue_total = models.DecimalField(
        "Итого выручка", max_digits=14, decimal_places=2
    )
    kpi_threshold = models.DecimalField(
        "KPI порог", max_digits=12, decimal_places=2
    )
    rate_below_kpi = models.DecimalField(
        "Ставка до KPI (%)", max_digits=5, decimal_places=2
    )
    rate_above_kpi = models.DecimalField(
        "Ставка сверх KPI (%)", max_digits=5, decimal_places=2
    )
    amount_below_kpi = models.DecimalField(
        "Сумма до KPI", max_digits=14, decimal_places=2
    )
    amount_above_kpi = models.DecimalField(
        "Сумма сверх KPI", max_digits=14, decimal_places=2
    )
    payroll_total = models.DecimalField(
        "Итого ФОТ", max_digits=14, decimal_places=2
    )
    is_confirmed = models.BooleanField("Подтверждён", default=False)
    confirmed_by = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="confirmed_payrolls",
        verbose_name="Подтвердил",
    )
    confirmed_at = models.DateTimeField("Дата подтверждения", null=True, blank=True)
    notes = models.TextField("Примечания", blank=True)

    class Meta:
        verbose_name = "Расчёт ФОТ"
        verbose_name_plural = "Расчёты ФОТ"
        unique_together = ["staff_member", "period"]
        ordering = ["-period"]

    def __str__(self):
        return f"ФОТ {self.staff_member.name} — {self.period:%Y-%m}"

    @property
    def kpi_status(self):
        if self.revenue_total >= self.kpi_threshold:
            return "exceeded"
        return "below"

    @property
    def effective_rate(self):
        if self.revenue_total > 0:
            return (self.payroll_total / self.revenue_total * 100).quantize(
                decimal.Decimal("0.1")
            )
        return 0


class TransactionCategory(models.Model):
    """Справочник категорий расходов."""

    TYPE_CHOICES = [
        ("operational", "Операционные"),
        ("loan", "Займы/Возвраты"),
        ("capex", "Капитальные вложения"),
        ("internal", "Внутренние переводы"),
    ]

    name = models.CharField("Название", max_length=100, unique=True)
    type = models.CharField("Тип", max_length=20, choices=TYPE_CHOICES)
    keywords = models.JSONField(
        "Ключевые слова",
        default=list,
        help_text="Список ключевых слов для автокатегоризации",
    )
    color = models.CharField(
        "Цвет",
        max_length=7,
        default="#888888",
        help_text="HEX цвет для графиков",
    )
    order = models.IntegerField("Порядок", default=0)

    class Meta:
        verbose_name = "Категория транзакции"
        verbose_name_plural = "Категории транзакций"
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class DailyReport(models.Model):
    """Один день кассового отчёта."""

    date = models.DateField("Дата", unique=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="daily_reports",
        verbose_name="Создал",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    notes = models.TextField("Примечания", blank=True)
    is_closed = models.BooleanField(
        "Закрыт",
        default=False,
        help_text="Закрытый день — нельзя редактировать",
    )
    source_file = models.CharField(
        "Исходный файл",
        max_length=255,
        blank=True,
        help_text="Имя .xlsx файла при импорте через import_excel",
    )

    class Meta:
        verbose_name = "Дневной отчёт"
        verbose_name_plural = "Дневные отчёты"
        ordering = ["-date"]

    def __str__(self):
        return f"Отчёт {self.date}"


class DailyTransaction(models.Model):
    """Одна строка в дневном отчёте."""

    ACCOUNT_CHOICES = [
        ("kaspi_pay", "Каспи pay"),
        ("halyk", "Halyk bank"),
        ("cash", "Наличные"),
    ]
    DIRECTION_CHOICES = [
        ("income", "Доход"),
        ("expense", "Расход"),
    ]

    report = models.ForeignKey(
        DailyReport,
        on_delete=models.CASCADE,
        related_name="transactions",
        verbose_name="Отчёт",
    )
    account = models.CharField("Счёт", max_length=20, choices=ACCOUNT_CHOICES)
    direction = models.CharField(
        "Направление", max_length=10, choices=DIRECTION_CHOICES
    )
    amount = models.DecimalField("Сумма", max_digits=14, decimal_places=2)
    comment = models.TextField("Комментарий", blank=True)
    category = models.ForeignKey(
        TransactionCategory,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="transactions",
        verbose_name="Категория",
    )
    row_order = models.IntegerField("Порядок", default=0)
    source = models.CharField("Источник", max_length=20, default="manual")

    class Meta:
        verbose_name = "Транзакция"
        verbose_name_plural = "Транзакции"
        ordering = ["row_order"]

    def __str__(self):
        return f"{self.report.date} | {self.get_account_display()} | {self.amount} тг"


class DailyBalance(models.Model):
    """Остатки на начало и конец дня по каждому счёту."""

    ACCOUNT_CHOICES = [
        ("kaspi_pay", "Каспи pay"),
        ("halyk", "Halyk bank"),
        ("cash", "Наличные"),
        ("usd", "USD"),
    ]

    report = models.ForeignKey(
        DailyReport,
        on_delete=models.CASCADE,
        related_name="balances",
        verbose_name="Отчёт",
    )
    account = models.CharField("Счёт", max_length=20, choices=ACCOUNT_CHOICES)
    balance_start = models.DecimalField(
        "Остаток начало дня", max_digits=14, decimal_places=2, default=0
    )
    balance_end = models.DecimalField(
        "Остаток конец дня", max_digits=14, decimal_places=2, default=0
    )

    class Meta:
        verbose_name = "Остаток по счёту"
        verbose_name_plural = "Остатки по счетам"
        unique_together = ["report", "account"]

    def __str__(self):
        return f"{self.report.date} | {self.get_account_display()}"
