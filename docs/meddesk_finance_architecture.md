# MedDesk — Finance Module Architecture
> Финансовый модуль для стоматологической клиники BALA DENT  
> Интеграция: MacDent API + ручной ввод + аналитика

---

## 0. Контекст и цель

### Текущая боль
```
MacDent → xlsx вручную → Excel таблицы → считаешь в голове → платишь врачам
```

### Цель
```
MacDent API → автосинхронизация каждый час
            → ФОТ считается автоматически
            → owner нажимает confirm
            → аналитика в реальном времени
```

### Что даёт MacDent API
| Endpoint | Данные | Зачем |
|---|---|---|
| `payment/find` | Платежи по врачам за период | Выручка, ФОТ |
| `rashodi/find` | Денежные операции | Расходы |
| `zapis/find` | Записи пациентов | Количество пациентов, загрузка |
| `doctor/find` | Список врачей | Синхронизация со StaffMember |
| `payment/get_detailed` | Детализация платежа | Структура выручки по услугам |
| `rasp/find` | Расписание врача | Плановые часы, загрузка кресла |

---

## 1. Backend — новые Django приложения

### Структура
```
apps/
├── finance/
│   ├── models.py
│   ├── admin.py
│   ├── tasks.py                    ← Celery задачи
│   ├── serializers.py
│   ├── views.py
│   ├── urls.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── macdent.py              ← HTTP клиент к MacDent
│   │   ├── sync.py                 ← синхронизация + расчёт ФОТ
│   │   └── categorization.py      ← категоризация транзакций
│   └── management/
│       └── commands/
│           ├── import_excel.py     ← импорт исторических xlsx
│           └── sync_macdent.py     ← ручной запуск синхронизации
```

---

## 2. Модели базы данных

### 2.1 Обновление StaffMember (apps/staff/models.py)
```python
class StaffMember(models.Model):
    # ... существующие поля ...
    macdent_id = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        unique=True,
        help_text='ID врача в системе MacDent (из doctor/find)'
    )
    kpi_threshold = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=4_500_000,
        help_text='KPI порог для повышенной ставки'
    )
    rate_below_kpi = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=30.00,
        help_text='Ставка % до KPI'
    )
    rate_above_kpi = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=35.00,
        help_text='Ставка % сверх KPI'
    )
```

### 2.2 Новые модели (apps/finance/models.py)

```python
from django.db import models
from django.contrib.auth import get_user_model
from apps.staff.models import StaffMember

User = get_user_model()


class MacDentSync(models.Model):
    """Лог синхронизаций с MacDent API"""
    STATUS_CHOICES = [
        ('running', 'В процессе'),
        ('success', 'Успешно'),
        ('error',   'Ошибка'),
    ]
    synced_at     = models.DateTimeField(auto_now_add=True)
    period_from   = models.DateField()
    period_to     = models.DateField()
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES)
    records_saved = models.IntegerField(default=0)
    error_message = models.TextField(blank=True)
    raw_response  = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ['-synced_at']


class DoctorRevenue(models.Model):
    """Оборот врача за день — источник MacDent или ручной ввод"""
    SOURCE_CHOICES = [
        ('macdent', 'MacDent API'),
        ('manual',  'Ручной ввод'),
        ('excel',   'Импорт Excel'),
    ]
    doctor         = models.ForeignKey(StaffMember, on_delete=models.CASCADE,
                                        related_name='revenues')
    date           = models.DateField()
    revenue        = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    hours_worked   = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    patients_count = models.IntegerField(default=0)
    source         = models.CharField(max_length=20, choices=SOURCE_CHOICES,
                                       default='macdent')
    raw_data       = models.JSONField(null=True, blank=True)

    class Meta:
        unique_together = ['doctor', 'date']
        ordering = ['-date']

    @property
    def revenue_per_hour(self):
        if self.hours_worked:
            return self.revenue / self.hours_worked
        return 0


class PayrollCalculation(models.Model):
    """Расчёт ФОТ сотрудника за месяц"""
    staff_member     = models.ForeignKey(StaffMember, on_delete=models.CASCADE,
                                          related_name='payrolls')
    period           = models.DateField(help_text='Первый день месяца')
    revenue_total    = models.DecimalField(max_digits=14, decimal_places=2)
    kpi_threshold    = models.DecimalField(max_digits=12, decimal_places=2)
    rate_below_kpi   = models.DecimalField(max_digits=5, decimal_places=2)
    rate_above_kpi   = models.DecimalField(max_digits=5, decimal_places=2)
    amount_below_kpi = models.DecimalField(max_digits=14, decimal_places=2)
    amount_above_kpi = models.DecimalField(max_digits=14, decimal_places=2)
    payroll_total    = models.DecimalField(max_digits=14, decimal_places=2)
    is_confirmed     = models.BooleanField(default=False)
    confirmed_by     = models.ForeignKey(User, null=True, blank=True,
                                          on_delete=models.SET_NULL)
    confirmed_at     = models.DateTimeField(null=True, blank=True)
    notes            = models.TextField(blank=True)

    class Meta:
        unique_together = ['staff_member', 'period']
        ordering = ['-period']

    @property
    def kpi_status(self):
        if self.revenue_total >= self.kpi_threshold:
            return 'exceeded'
        return 'below'

    @property
    def effective_rate(self):
        if self.revenue_total > 0:
            return (self.payroll_total / self.revenue_total * 100).quantize(
                __import__('decimal').Decimal('0.1')
            )
        return 0


class TransactionCategory(models.Model):
    """Справочник категорий расходов"""
    TYPE_CHOICES = [
        ('operational', 'Операционные'),
        ('loan',        'Займы/Возвраты'),
        ('capex',       'Капитальные вложения'),
        ('internal',    'Внутренние переводы'),
    ]
    name     = models.CharField(max_length=100, unique=True)
    type     = models.CharField(max_length=20, choices=TYPE_CHOICES)
    keywords = models.JSONField(
        default=list,
        help_text='Список ключевых слов для автокатегоризации'
    )
    color    = models.CharField(max_length=7, default='#888888',
                                 help_text='HEX цвет для графиков')
    order    = models.IntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class DailyReport(models.Model):
    """Один день кассового отчёта — аналог листа в Excel"""
    date       = models.DateField(unique=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    notes      = models.TextField(blank=True)
    is_closed  = models.BooleanField(default=False,
                                      help_text='Закрытый день — нельзя редактировать')

    class Meta:
        ordering = ['-date']


class DailyTransaction(models.Model):
    """Одна строка в дневном отчёте"""
    ACCOUNT_CHOICES = [
        ('kaspi_pay', 'Каспи pay'),
        ('halyk',     'Halyk bank'),
        ('cash',      'Наличные'),
    ]
    DIRECTION_CHOICES = [
        ('income',  'Доход'),
        ('expense', 'Расход'),
    ]
    report    = models.ForeignKey(DailyReport, on_delete=models.CASCADE,
                                   related_name='transactions')
    account   = models.CharField(max_length=20, choices=ACCOUNT_CHOICES)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    amount    = models.DecimalField(max_digits=14, decimal_places=2)
    comment   = models.TextField(blank=True)
    category  = models.ForeignKey(TransactionCategory, null=True, blank=True,
                                   on_delete=models.SET_NULL)
    row_order = models.IntegerField(default=0)
    source    = models.CharField(max_length=20, default='manual')

    class Meta:
        ordering = ['row_order']


class DailyBalance(models.Model):
    """Остатки на начало и конец дня по каждому счёту"""
    ACCOUNT_CHOICES = [
        ('kaspi_pay', 'Каспи pay'),
        ('halyk',     'Halyk bank'),
        ('cash',      'Наличные'),
        ('usd',       'USD'),
    ]
    report        = models.ForeignKey(DailyReport, on_delete=models.CASCADE,
                                       related_name='balances')
    account       = models.CharField(max_length=20, choices=ACCOUNT_CHOICES)
    balance_start = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    balance_end   = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        unique_together = ['report', 'account']
```

---

## 3. MacDent API клиент

```python
# apps/finance/services/macdent.py

import requests
import logging
from django.conf import settings

logger = logging.getLogger(__name__)
MACDENT_BASE = 'https://api-developer.macdent.kz'


class MacDentClient:

    def __init__(self):
        self.token    = settings.MACDENT_API_TOKEN
        self.filial_id = settings.MACDENT_FILIAL_ID

    def _post(self, group: str, method: str, params: dict = None) -> dict:
        url = f'{MACDENT_BASE}/{group}/{method}'
        payload = {'access_token': self.token, **(params or {})}
        try:
            r = requests.post(url, data=payload, timeout=30)
            r.raise_for_status()
            data = r.json()
            if data.get('isTokenNeedToBeUpdated'):
                logger.error('MacDent: токен устарел, нужна переавторизация')
                return {}
            if not data.get('response'):
                logger.error(f'MacDent error [{group}/{method}]: {data.get("error")}')
                return {}
            return data
        except requests.RequestException as e:
            logger.error(f'MacDent request failed [{group}/{method}]: {e}')
            return {}

    # ── Платежи ────────────────────────────────────────────────────
    def get_payments(self, date_from: str, date_to: str) -> list:
        data = self._post('payment', 'find', {
            'date_from': date_from,
            'date_to':   date_to,
        })
        return data.get('data', [])

    def get_payment_detail(self, payment_id) -> dict:
        return self._post('payment', 'get_detailed', {'id': payment_id})

    # ── Расходы ────────────────────────────────────────────────────
    def get_expenses(self, date_from: str, date_to: str) -> list:
        data = self._post('rashodi', 'find', {
            'date_from': date_from,
            'date_to':   date_to,
        })
        return data.get('data', [])

    # ── Записи пациентов ───────────────────────────────────────────
    def get_appointments(self, date_from: str, date_to: str) -> list:
        data = self._post('zapis', 'find', {
            'date_from': date_from,
            'date_to':   date_to,
        })
        return data.get('data', [])

    # ── Врачи ─────────────────────────────────────────────────────
    def get_doctors(self) -> list:
        data = self._post('doctor', 'find', {})
        return data.get('data', [])

    # ── Расписание ────────────────────────────────────────────────
    def get_schedule(self, date_from: str, date_to: str) -> list:
        data = self._post('rasp', 'find', {
            'date_from': date_from,
            'date_to':   date_to,
        })
        return data.get('data', [])
```

---

## 4. Сервис синхронизации и расчёта ФОТ

```python
# apps/finance/services/sync.py

import calendar
from datetime import date, timedelta
from decimal import Decimal
from django.db.models import Sum
from .macdent import MacDentClient
from ..models import DoctorRevenue, PayrollCalculation, MacDentSync
from apps.staff.models import StaffMember


class FinanceSyncService:

    def __init__(self):
        self.client = MacDentClient()

    # ── Синхронизация ─────────────────────────────────────────────

    def sync_today(self):
        today = date.today()
        return self.sync_period(today, today)

    def sync_period(self, date_from: date, date_to: date):
        log = MacDentSync.objects.create(
            period_from=date_from,
            period_to=date_to,
            status='running'
        )
        try:
            payments = self.client.get_payments(
                date_from.isoformat(),
                date_to.isoformat()
            )
            saved = self._save_revenues(payments)

            log.status = 'success'
            log.records_saved = saved
            log.save()
            return saved

        except Exception as e:
            log.status = 'error'
            log.error_message = str(e)
            log.save()
            raise

    def _save_revenues(self, payments: list) -> int:
        saved = 0
        for p in payments:
            doctor_id = p.get('doctor_id')
            if not doctor_id:
                continue
            try:
                staff = StaffMember.objects.get(macdent_id=str(doctor_id))
            except StaffMember.DoesNotExist:
                continue

            _, created = DoctorRevenue.objects.update_or_create(
                doctor=staff,
                date=p.get('date'),
                defaults={
                    'revenue':        Decimal(str(p.get('amount', 0))),
                    'patients_count': p.get('patients_count', 0),
                    'hours_worked':   Decimal(str(p.get('hours', 0))),
                    'source':         'macdent',
                    'raw_data':       p,
                }
            )
            saved += 1
        return saved

    # ── Расчёт ФОТ ────────────────────────────────────────────────

    def calculate_payroll(self, year: int, month: int):
        """Считает ФОТ за месяц по каждому врачу"""
        _, last_day   = calendar.monthrange(year, month)
        period_start  = date(year, month, 1)
        period_end    = date(year, month, last_day)

        revenues = (DoctorRevenue.objects
            .filter(date__range=[period_start, period_end])
            .values('doctor')
            .annotate(total=Sum('revenue')))

        results = []
        for row in revenues:
            staff  = StaffMember.objects.get(pk=row['doctor'])
            rev    = row['total']
            kpi    = staff.kpi_threshold
            rate_b = staff.rate_below_kpi / 100
            rate_a = staff.rate_above_kpi / 100

            if rev <= kpi:
                below = rev * rate_b
                above = Decimal('0')
            else:
                below = kpi * rate_b
                above = (rev - kpi) * rate_a

            total_pay = below + above

            obj, _ = PayrollCalculation.objects.update_or_create(
                staff_member=staff,
                period=period_start,
                defaults={
                    'revenue_total':    rev,
                    'kpi_threshold':    kpi,
                    'rate_below_kpi':   staff.rate_below_kpi,
                    'rate_above_kpi':   staff.rate_above_kpi,
                    'amount_below_kpi': below,
                    'amount_above_kpi': above,
                    'payroll_total':    total_pay,
                    'is_confirmed':     False,
                }
            )
            results.append(obj)
        return results
```

---

## 5. Celery — фоновые задачи

```python
# apps/finance/tasks.py

from celery import shared_task
from datetime import date
import logging

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def sync_macdent_today(self):
    """Каждый час с 8:00 до 22:00 — синхронизация текущего дня"""
    from .services.sync import FinanceSyncService
    try:
        saved = FinanceSyncService().sync_today()
        logger.info(f'MacDent sync: {saved} records saved')
    except Exception as e:
        logger.error(f'MacDent sync failed: {e}')
        self.retry(countdown=300, exc=e)  # повтор через 5 мин


@shared_task
def calculate_monthly_payroll():
    """1-го числа в 08:00 — итоговый ФОТ за прошлый месяц"""
    from .services.sync import FinanceSyncService
    from datetime import date
    today  = date.today()
    month  = today.month - 1 if today.month > 1 else 12
    year   = today.year if today.month > 1 else today.year - 1
    FinanceSyncService().calculate_payroll(year, month)
    logger.info(f'Payroll calculated for {year}-{month:02d}')
```

```python
# config/celery.py — добавить в CELERY_BEAT_SCHEDULE

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'sync-macdent-hourly': {
        'task':     'apps.finance.tasks.sync_macdent_today',
        'schedule': crontab(minute=0, hour='8-22'),
    },
    'monthly-payroll': {
        'task':     'apps.finance.tasks.calculate_monthly_payroll',
        'schedule': crontab(hour=8, minute=0, day_of_month=1),
    },
}
```

---

## 6. API Endpoints

```python
# api/v1/finance/urls.py

urlpatterns = [
    # Сводка
    path('summary/',     FinanceSummaryView.as_view()),
    # → GET ?period=month&year=2026&month=5
    # → доход, расход, прибыль операц., остатки по счетам

    # P&L помесячно (3 уровня)
    path('pnl/',         PnLView.as_view()),
    # → GET ?from=2024-01&to=2026-05
    # → reported / no_loans / operating по каждому месяцу

    # Остатки по дням
    path('balances/',    BalancesView.as_view()),
    # → GET ?from=2024-01&to=2026-05&account=all

    # Расходы по категориям
    path('expenses/',    ExpensesView.as_view()),
    # → GET ?from=2024-01&to=2026-05

    # Обороты и ФОТ врачей
    path('doctors/',     DoctorRevenueView.as_view()),
    # → GET ?from=2024-01&to=2026-05

    # ФОТ за месяц
    path('payroll/',     PayrollListView.as_view()),
    # → GET ?period=2026-05

    path('payroll/<int:pk>/confirm/', PayrollConfirmView.as_view()),
    # → POST — owner подтверждает выплату

    # Ежедневный ввод (замена Excel листа)
    path('daily/',           DailyReportListView.as_view()),
    path('daily/<int:pk>/',  DailyReportDetailView.as_view()),

    # Статус синхронизации
    path('sync/status/',  SyncStatusView.as_view()),
    path('sync/trigger/', SyncTriggerView.as_view()),
    # → POST — ручной запуск синхронизации
]
```

---

## 7. Docker Compose — добавить Redis и Celery

```yaml
# docker-compose.yml — добавить сервисы

redis:
  image: redis:7-alpine
  restart: unless-stopped

celery-worker:
  build: ./backend
  command: celery -A config worker -l info -Q default
  env_file: .env
  depends_on:
    - db
    - redis
  restart: unless-stopped

celery-beat:
  build: ./backend
  command: celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
  env_file: .env
  depends_on:
    - db
    - redis
  restart: unless-stopped
```

```
# requirements.txt — добавить
celery==5.3.6
redis==5.0.1
django-celery-beat==2.6.0
```

---

## 8. Переменные окружения

```bash
# .env — добавить

# MacDent API (тестовый)
MACDENT_API_TOKEN=<твой_токен>
MACDENT_FILIAL_ID=1196

# Redis (для Celery)
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
```

---

## 9. Frontend — структура компонентов

```
src/pages/FinancePage.tsx
├── PeriodSelector                  ← месяц / квартал / год / произвольный
├── KPICards (4 карточки)
│   ├── Доход
│   ├── Операц. расход
│   ├── Операц. прибыль
│   └── Остаток на счетах + Runway
│
└── <Tabs>
    ├── OverviewTab
    │   ├── RevenueExpenseChart     ← бар: доход/расход/прибыль по месяцам
    │   ├── CumulativeProfitChart   ← 3 линии: факт / без займов / операц.
    │   └── MarginChart             ← маржа % по месяцам
    │
    ├── BalancesTab
    │   ├── DailyBalanceChart       ← линии: Каспи / Halyk / Нал / Итого
    │   ├── MonthlyBalanceStack     ← стек-бар по счетам
    │   └── CashGapAlert            ← ⚠️ если runway < 30 дней
    │
    ├── ExpensesTab
    │   ├── CategoryPieChart        ← пирог по категориям
    │   ├── CategoryStackBar        ← стек расходов по месяцам
    │   └── CategoryTable           ← детальная таблица с поиском
    │
    ├── DoctorsTab
    │   ├── DoctorRevenueStack      ← стек оборотов по врачам
    │   ├── KPIProgressBars         ← прогресс к KPI в текущем месяце
    │   ├── RevenuePerHourChart     ← выручка/час по врачам
    │   └── DoctorTable             ← таблица: оборот / ставка / ФОТ / клинике
    │
    ├── PayrollTab
    │   ├── PayrollSummaryCard      ← итого к выплате за месяц
    │   ├── DoctorPayrollCard × N   ← карточка каждого врача:
    │   │   ├── оборот
    │   │   ├── KPI статус (выполнил/нет)
    │   │   ├── ставка (30% / 33% / 35%)
    │   │   └── сумма к выплате
    │   └── ConfirmAllButton        ← owner подтверждает выплату
    │
    └── DailyInputTab               ← замена Excel листа
        ├── DatePicker
        ├── BalanceStartRow         ← остатки на начало дня
        ├── AccountSection × 3      ← Каспи / Halyk / Нал
        │   └── TransactionRow × N  ← доход | расход | комментарий
        ├── BalanceEndRow           ← остатки на конец дня (автосчёт)
        └── SaveButton
```

---

## 10. Финансовая логика — три уровня P&L

```
Уровень 1 — ФАКТИЧЕСКИЙ (как проходит через кассу)
  = Доход − Все расходы из кассы

Уровень 2 — БЕЗ ЗАЙМОВ
  = Доход − Операционные расходы − Капекс
  (займы и внутренние переводы исключены)

Уровень 3 — ОПЕРАЦИОННЫЙ (реальная сила бизнеса)
  = Доход − Только операционные расходы
  (займы + капекс исключены)
```

### Категории транзакций (данные для TransactionCategory)
| Категория | Тип | Ключевые слова (примеры) |
|---|---|---|
| Наркоз | operational | д.с. наркоз, ж.м. наркоз, калымбетова |
| Зарплата | operational | зп, з/п, зарплат, индира |
| Аренда | operational | мурзабекова, аренда помещ |
| Маркетинг | operational | таргет, 2gis, smm, выставка |
| Материалы | operational | стом. матер, dental, nu smile |
| Налоги | operational | опв, ипн, осмс, соц налог |
| Комиссии банков | operational | kaspi red, halyk карта, комиссия |
| Оборудование | capex | medsyst, микроскоп, кресло, компрессор |
| Займы/Возвраты | loan | асыл, ип тимур, jta shop, ломбард |
| Внутр. переводы | internal | на счет kaspi, пополнение на, перекинули |

---

## 11. Расчёт ФОТ — логика

```python
# Ставки по умолчанию (хранятся в StaffMember)
KPI_THRESHOLD  = 4_500_000  # тг/мес
RATE_BELOW_KPI = 30%
RATE_ABOVE_KPI = 35%

# Расчёт
if revenue <= KPI_THRESHOLD:
    payroll = revenue * 0.30
else:
    payroll = (KPI_THRESHOLD * 0.30 +
              (revenue - KPI_THRESHOLD) * 0.35)

# Пример: Дана, оборот 15.7M
# = 4.5M × 30% + 11.2M × 35%
# = 1.35M + 3.92M = 5.27M (эффективная ставка 33.6%)
```

---

## 12. Порядок внедрения

### Фаза 1 — Данные (2 недели)
- [ ] Добавить `macdent_id` в StaffMember + миграция
- [ ] Создать все модели Finance + миграции
- [ ] Загрузить категории `TransactionCategory` через fixtures
- [ ] Реализовать `MacDentClient` + тест на реальном API
- [ ] `import_excel` management command — импорт исторических данных 2024-2026
- [ ] Заполнить `macdent_id` для каждого врача через `doctor/find`

### Фаза 2 — Синхронизация (1 неделя)
- [ ] `FinanceSyncService.sync_period()` + тесты
- [ ] Подключить Redis + Celery в Docker Compose
- [ ] Celery задачи: почасовая синхронизация + ежемесячный ФОТ
- [ ] API endpoints: summary, pnl, balances, doctors

### Фаза 3 — Frontend просмотр (1 неделя)
- [ ] KPICards + RevenueExpenseChart
- [ ] DailyBalanceChart + MonthlyBalanceStack
- [ ] DoctorsTab с KPI прогресс-барами

### Фаза 4 — ФОТ и подтверждение (1 неделя)
- [ ] PayrollTab + DoctorPayrollCard
- [ ] `payroll/<id>/confirm/` endpoint
- [ ] Уведомление owner когда ФОТ готов к подтверждению

### Фаза 5 — Ежедневный ввод (1 неделя)
- [ ] DailyInputTab — замена Excel листа
- [ ] Автокатегоризация при вводе комментария
- [ ] Автосчёт остатков на конец дня

---

## 13. Исторические данные — что уже есть

Из анализа кассовых таблиц (март 2024 — май 2026):

| Показатель | Значение |
|---|---|
| Периодов (листов) | 747 |
| Транзакций | 17 149 |
| Общий доход | 475.3M тг |
| Операц. прибыль (без займов) | 96.2M тг |
| EBITDA (без займов + капекса) | 145.3M тг |
| Возвращено займов | 81.2M тг |
| Капекс (оборудование) | 49.1M тг |
| Breakeven | 6.8M / 8.85M тг/мес* |

> *6.8M — исторический, 8.85M — текущий с новыми расходами (с июня 2026)

Парсер xlsx написан и протестирован — находится в Jupyter ноутбуках проекта. При импорте исторических данных используй `import_excel` management command.

---

## 14. Связи с существующими моделями MedDesk

```
Room (apps/schedule)
  └── DailyReport.room          ← кассовый лист привязан к кабинету

StaffMember (apps/staff)
  ├── DoctorRevenue.doctor      ← оборот врача
  └── PayrollCalculation.staff  ← ФОТ врача

User (apps/accounts)
  ├── DailyReport.created_by    ← кто заполнял
  └── PayrollCalculation.confirmed_by ← кто подтвердил

ClinicMembership.role           ← доступ к данным:
  owner/admin  → все данные
  doctor       → только свой оборот и ФОТ
  receptionist → только DailyInput (ввод дня)
```
