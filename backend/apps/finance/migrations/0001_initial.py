import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("staff", "0002_staffmember_macdent_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="TransactionCategory",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100, unique=True, verbose_name="Название")),
                ("type", models.CharField(choices=[("operational", "Операционные"), ("loan", "Займы/Возвраты"), ("capex", "Капитальные вложения"), ("internal", "Внутренние переводы")], max_length=20, verbose_name="Тип")),
                ("keywords", models.JSONField(default=list, help_text="Список ключевых слов для автокатегоризации", verbose_name="Ключевые слова")),
                ("color", models.CharField(default="#888888", help_text="HEX цвет для графиков", max_length=7, verbose_name="Цвет")),
                ("order", models.IntegerField(default=0, verbose_name="Порядок")),
            ],
            options={
                "verbose_name": "Категория транзакции",
                "verbose_name_plural": "Категории транзакций",
                "ordering": ["order", "name"],
            },
        ),
        migrations.CreateModel(
            name="MacDentSync",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("synced_at", models.DateTimeField(auto_now_add=True)),
                ("period_from", models.DateField(verbose_name="Период с")),
                ("period_to", models.DateField(verbose_name="Период по")),
                ("status", models.CharField(choices=[("running", "В процессе"), ("success", "Успешно"), ("error", "Ошибка")], max_length=20, verbose_name="Статус")),
                ("records_saved", models.IntegerField(default=0, verbose_name="Сохранено записей")),
                ("error_message", models.TextField(blank=True, verbose_name="Ошибка")),
                ("raw_response", models.JSONField(blank=True, null=True, verbose_name="Ответ API")),
            ],
            options={
                "verbose_name": "Синхронизация MacDent",
                "verbose_name_plural": "Синхронизации MacDent",
                "ordering": ["-synced_at"],
            },
        ),
        migrations.CreateModel(
            name="DoctorRevenue",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(verbose_name="Дата")),
                ("revenue", models.DecimalField(decimal_places=2, default=0, max_digits=14, verbose_name="Выручка")),
                ("hours_worked", models.DecimalField(decimal_places=2, default=0, max_digits=6, verbose_name="Часов отработано")),
                ("patients_count", models.IntegerField(default=0, verbose_name="Пациентов")),
                ("source", models.CharField(choices=[("macdent", "MacDent API"), ("manual", "Ручной ввод"), ("excel", "Импорт Excel")], default="macdent", max_length=20, verbose_name="Источник")),
                ("raw_data", models.JSONField(blank=True, null=True, verbose_name="Исходные данные")),
                ("doctor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="revenues", to="staff.staffmember", verbose_name="Врач")),
            ],
            options={
                "verbose_name": "Выручка врача",
                "verbose_name_plural": "Выручка врачей",
                "ordering": ["-date"],
                "unique_together": {("doctor", "date")},
            },
        ),
        migrations.CreateModel(
            name="PayrollCalculation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("period", models.DateField(verbose_name="Период (первый день месяца)")),
                ("revenue_total", models.DecimalField(decimal_places=2, max_digits=14, verbose_name="Итого выручка")),
                ("kpi_threshold", models.DecimalField(decimal_places=2, max_digits=12, verbose_name="KPI порог")),
                ("rate_below_kpi", models.DecimalField(decimal_places=2, max_digits=5, verbose_name="Ставка до KPI (%)")),
                ("rate_above_kpi", models.DecimalField(decimal_places=2, max_digits=5, verbose_name="Ставка сверх KPI (%)")),
                ("amount_below_kpi", models.DecimalField(decimal_places=2, max_digits=14, verbose_name="Сумма до KPI")),
                ("amount_above_kpi", models.DecimalField(decimal_places=2, max_digits=14, verbose_name="Сумма сверх KPI")),
                ("payroll_total", models.DecimalField(decimal_places=2, max_digits=14, verbose_name="Итого ФОТ")),
                ("is_confirmed", models.BooleanField(default=False, verbose_name="Подтверждён")),
                ("confirmed_at", models.DateTimeField(blank=True, null=True, verbose_name="Дата подтверждения")),
                ("notes", models.TextField(blank=True, verbose_name="Примечания")),
                ("confirmed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="confirmed_payrolls", to=settings.AUTH_USER_MODEL, verbose_name="Подтвердил")),
                ("staff_member", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="payrolls", to="staff.staffmember", verbose_name="Сотрудник")),
            ],
            options={
                "verbose_name": "Расчёт ФОТ",
                "verbose_name_plural": "Расчёты ФОТ",
                "ordering": ["-period"],
                "unique_together": {("staff_member", "period")},
            },
        ),
        migrations.CreateModel(
            name="DailyReport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(unique=True, verbose_name="Дата")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("notes", models.TextField(blank=True, verbose_name="Примечания")),
                ("is_closed", models.BooleanField(default=False, help_text="Закрытый день — нельзя редактировать", verbose_name="Закрыт")),
                ("created_by", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="daily_reports", to=settings.AUTH_USER_MODEL, verbose_name="Создал")),
            ],
            options={
                "verbose_name": "Дневной отчёт",
                "verbose_name_plural": "Дневные отчёты",
                "ordering": ["-date"],
            },
        ),
        migrations.CreateModel(
            name="DailyTransaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("account", models.CharField(choices=[("kaspi_pay", "Каспи pay"), ("halyk", "Halyk bank"), ("cash", "Наличные")], max_length=20, verbose_name="Счёт")),
                ("direction", models.CharField(choices=[("income", "Доход"), ("expense", "Расход")], max_length=10, verbose_name="Направление")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=14, verbose_name="Сумма")),
                ("comment", models.TextField(blank=True, verbose_name="Комментарий")),
                ("row_order", models.IntegerField(default=0, verbose_name="Порядок")),
                ("source", models.CharField(default="manual", max_length=20, verbose_name="Источник")),
                ("category", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="transactions", to="finance.transactioncategory", verbose_name="Категория")),
                ("report", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="transactions", to="finance.dailyreport", verbose_name="Отчёт")),
            ],
            options={
                "verbose_name": "Транзакция",
                "verbose_name_plural": "Транзакции",
                "ordering": ["row_order"],
            },
        ),
        migrations.CreateModel(
            name="DailyBalance",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("account", models.CharField(choices=[("kaspi_pay", "Каспи pay"), ("halyk", "Halyk bank"), ("cash", "Наличные"), ("usd", "USD")], max_length=20, verbose_name="Счёт")),
                ("balance_start", models.DecimalField(decimal_places=2, default=0, max_digits=14, verbose_name="Остаток начало дня")),
                ("balance_end", models.DecimalField(decimal_places=2, default=0, max_digits=14, verbose_name="Остаток конец дня")),
                ("report", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="balances", to="finance.dailyreport", verbose_name="Отчёт")),
            ],
            options={
                "verbose_name": "Остаток по счёту",
                "verbose_name_plural": "Остатки по счетам",
                "unique_together": {("report", "account")},
            },
        ),
    ]
