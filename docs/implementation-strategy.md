# MedDesk — Стратегия внедрения изменений

**Основание:** [fable-review-ru.md](./fable-review-ru.md)  
**Дата:** 2026-06-10  
**Горизонт:** 3 фазы (~3 месяца) → разбивка первой фазы на спринты

---

## Принципы приоритизации

1. **Деньги важнее фич.** Любой баг, искажающий P&L или расчёт ФОТ, блокирует всё остальное.
2. **Безопасность — не последний шаг.** API открыт любому авторизованному пользователю — это устраняется в первом же спринте.
3. **Не ломать рабочее.** Каждое изменение — отдельная ветка, миграции — обратно совместимы, деплой — поэтапный.
4. **Тест перед мержем.** Для каждого критического бага — регрессионный тест до мержа фикса.

---

## Обзор фаз

| Фаза | Название | Срок | Цель |
|---|---|---|---|
| **0** | Стабилизация | Спринты 1–3 (~6 нед.) | Система не врёт в деньгах и не открыта всем |
| **1** | Корректность | Спринты 4–6 (~6 нед.) | Расчёты сходятся, кассовая книга самосогласована |
| **2** | Надёжность | Спринты 7–9 (~6 нед.) | Аналитика честная, инфра production-grade |

---

## Фаза 0 — Стабилизация (6 недель)

> Цель: клиника может доверять цифрам в системе. Ни один из критических багов C1–C4 и C6 не активен.

---

### Спринт 1 (нед. 1–2) — Безопасность API и мягкое удаление

**Задачи:**

**[C1] API-level RBAC**

Создать permission-класс `RoleTabPermission`, читающий `RoleTabAccess` из БД:

```python
# apps/accounts/permissions.py
class RoleTabPermission(BasePermission):
    required_tab: str  # задаётся в каждом view

    def has_permission(self, request, view):
        tabs = get_user_tabs(request.user)  # уже есть, просто вынести
        return self.required_tab in tabs
```

Применить ко всем finance/staff/scheduler views:

| View | Текущий permission | Нужный |
|---|---|---|
| `FinanceSummaryView` | `IsAuthenticated` | `RoleTabPermission(tab="finance")` |
| `DailyReportView` (GET+POST) | `IsAuthenticated` | `RoleTabPermission(tab="finance")` |
| `PayrollListView` | `IsAuthenticated` | `RoleTabPermission(tab="finance")` |
| `DoctorsRevenueView` | `IsAuthenticated` | `RoleTabPermission(tab="finance")` |
| `StaffMemberViewSet` (write) | `IsAuthenticated` | owner/admin только |
| `SchedulerStateView` (PUT) | `IsAuthenticated` | `RoleTabPermission(tab="schedule")` |

**[C6] Мягкое удаление сотрудников**

```python
# apps/staff/views.py
def destroy(self, request, *args, **kwargs):
    instance = self.get_object()
    instance.is_active = False
    instance.save()
    return Response(status=204)
```

Изменить `on_delete` у `DoctorRevenue.doctor` и `PayrollCalculation.staff_member` с `CASCADE` на `PROTECT`. Написать миграцию.

**[C1] Раскрыть KPI-поля только для owner**

Добавить `kpi_threshold`, `rate_below_kpi`, `rate_above_kpi` в `StaffMemberSerializer` с кастомным `to_representation` / write permission check.

**Тесты спринта:**
- `test_finance_rbac.py`: каждый role × каждый endpoint → ожидаемый статус (403 / 200)
- `test_staff_soft_delete.py`: DELETE → is_active=False, история не удалена

**Критерий готовности:** врач не может GET `/finance/summary/`, не может PATCH свою ставку.

---

### Спринт 2 (нед. 3–4) — MacDent sync и деплой HTTPS

**Задачи:**

**[C2] Агрегация выручки MacDent**

```python
# apps/finance/services/sync.py — заменить цикл upsert

from collections import defaultdict
aggregated = defaultdict(lambda: {"revenue": Decimal(0), "patients": 0, "raws": []})

for p in payments:
    key = (doctor_id, pay_date)
    aggregated[key]["revenue"] += Decimal(str(p.get("summ", 0)))
    aggregated[key]["patients"] += 1
    aggregated[key]["raws"].append(p)

for (doctor_id, pay_date), data in aggregated.items():
    DoctorRevenue.objects.update_or_create(
        doctor=staff_map[doctor_id], date=pay_date,
        defaults={
            "revenue": data["revenue"],
            "patients_count": data["patients"],
            "raw_data": data["raws"],
            "source": "macdent",
        },
    )
```

Отдельно обработать коллизию с `source="excel"/"manual"` — не перезаписывать, а создавать конфликт-запись с флагом для owner-review (или логировать предупреждение).

**[Рек. 8] HTTPS**

- Получить Let's Encrypt сертификат (certbot + nginx).
- Обновить `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `SECURE_SSL_REDIRECT=True` в production.py.
- Убедиться что JWT-куки (если будет переход) или хотя бы `Referrer-Policy`, `X-Content-Type-Options` выставлены.

**[Баг 10] Троттлинг входа**

```python
# config/settings/base.py
REST_FRAMEWORK = {
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.AnonRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"anon": "10/min"},
}
```

Применить `AnonRateThrottle` к `EmailLoginView`.

**Тесты спринта:**
- `test_macdent_sync.py`: 6 платежей одного врача → `revenue == 300 000`, `patients_count == 6`
- `test_sync_no_overwrite_excel.py`: sync не перезаписывает `source="excel"` строки

**Критерий готовности:** тестовый запуск `sync_macdent` с любым набором данных даёт суммарную выручку, а не выручку последнего платежа.

---

### Спринт 3 (нед. 5–6) — Дублирование транзакций и баг email

**Задачи:**

**[C3] Фикс дублирования при переоткрытии импортированного дня**

Три изменения:

1. **GET** — добавить `source` в ответ `DailyReportView`:
```python
# в сериализаторе транзакций
fields = [..., "source"]
```

2. **Frontend** — разделить строки на редактируемые (manual) и read-only (excel/macdent):
```tsx
// DailyInputTab.tsx
const isEditable = (row) => row.source === "manual" || row.source === null;
```
Non-manual строки отображаются отдельной секцией, без поля ввода, с пометкой источника.

3. **POST** — заменить «удалить только manual» на «удалить manual + reconcile по id»:
```python
# DailyReportView.post
existing_non_manual = report.transactions.exclude(source="manual")
# не трогаем их; создаём только новые manual
```

**[Баг 1] Уникальный email**

```python
# apps/accounts/models.py
class User(AbstractUser):
    email = models.EmailField(unique=True)  # добавить
```

Миграция + `EmailLoginView`: заменить `.get(email__iexact=...)` на `.filter(...).first()` с обработкой `None`.

**[Баг 11] token_blacklist**

```python
INSTALLED_APPS += ["rest_framework_simplejwt.token_blacklist"]
SIMPLE_JWT["BLACKLIST_AFTER_ROTATION"] = True
```

Миграция.

**Тесты спринта:**
- `test_reopen_imported_day.py`: переоткрыть excel-день → сохранить → транзакции не удвоились
- `test_email_unique.py`: два пользователя с одним email → 400, не 500

**Критерий готовности:** владелец может переоткрыть и пересохранить любой из 470 импортированных дней без изменения итогов месяца.

---

## Фаза 1 — Корректность (6 недель)

> Цель: один расчёт ФОТ, самосогласованная кассовая книга, нет гонок данных.

---

### Спринт 4 — Унификация модели зарплат [C4]

**Решение:** оставить KPI-прогрессивную модель (`StaffMember.kpi_threshold / rate_below_kpi / rate_above_kpi`), удалить `SalaryRule` и `salary.py`.

Порядок:
1. Написать миграцию: для каждого `StaffMember` взять данные из связанного `SalaryRule` (если есть) и заполнить KPI-поля — сохранить данные.
2. Удалить модель `SalaryRule` и таблицу.
3. Удалить `apps/staff/salary.py` и `test_salary.py`.
4. Создать `apps/staff/services/payroll_calc.py` — единая функция `calculate_doctor_salary(staff, revenue) -> Decimal`, покрытая тестами.
5. Заменить вызов в `FinanceSyncService.calculate_payroll` на эту функцию.
6. Заменить `calcDoctorSalary` на frontend вызов нового endpoint `GET /api/v1/staff/{id}/salary-preview/?revenue=N`.

**Спринт 5 — Серверные остатки и прямой пересчёт [C5]**

1. Убрать `opening_balances` из тела POST `daily-report` — сервер сам берёт `balance_end` предыдущего дня.
2. После каждого сохранения дня — запускать `propagate_balances_forward(from_date)` синхронно (до ~100 дней вперёд — миллисекунды).
3. Добавить `updated_at` к `DailyReport` и оптимистичную блокировку: если клиент присылает устаревший `updated_at` — 409 Conflict.
4. Удалить management-команды `fix_opening_balances` / `check_balance_chain` как больше не нужные (или оставить как read-only health-check).

**Спринт 6 — Оптимистичная блокировка планировщика + анестезиологи**

1. Добавить `version` к `SchedulerState` — при PUT с устаревшей версией → 409.
2. Вынести `expenses` из `SchedulerState.data` в `MonthlyExpenses` (модель уже упомянута в CLAUDE.md, создать её заново согласно архитектуре). Обновить frontend.
3. Добавить путь расчёта ФОТ для анестезиологов (фиксированная ставка или % от выручки клиники — уточнить с владельцем).

---

## Фаза 2 — Надёжность (6 недель)

> Цель: честная аналитика, production-grade инфра, актуальная документация.

---

### Спринт 7 — TransactionCategory и честная прибыль

1. Засидить категории из текущих захардкоженных `icontains` фильтров + личных имён.
2. При сохранении транзакции — автоматически присваивать категорию через `classify_transaction(comment, amount)`.
3. В `FinanceSummaryView` — считать `profit` только от `type="operational"`, отдельно показывать `loans`, `capex`, `internal`.
4. Обновить дашборд: добавить breakdown по типам.

### Спринт 8 — Celery, тесты, мультиклиника-решение

1. Засидить периодические задачи Celery Beat в `data migration` (не ручной admin).
2. Добавить `calculate_monthly_payroll` Celery task.
3. Сделать sync-ошибки громкими: `MacDentSync.status = "error"` + уведомление owner (email или флаг в UI).
4. **Архитектурное решение по мультиклинике:** добавить `clinic` FK к `DailyReport`, `DoctorRevenue`, `PayrollCalculation`, `RoleTabAccess` + скоупить все queryset-ы по `request.user.clinic`.
5. Исправить `_is_owner` / `_is_owner_or_admin` — проверять членство в конкретной клинике.

### Спринт 9 — Frontend, CLAUDE.md, деплой

1. Убрать `@ts-nocheck` с `ClinicScheduler.tsx` — исправить типы.
2. Исправить `calcDoctorSalary` (стэкинг вычетов) и формулу дневной выручки.
3. Исправить offline-queue замыкания (`useCallback` с правильными зависимостями).
4. Добавить `fetchStaff` pagination (цикл по страницам пока `next != null`).
5. **Переписать CLAUDE.md**: привести в соответствие с реальными моделями, endpoints, Docker-конфигом. Убрать фантомные маршруты (`/rooms/`, `DELETE /schedule/slot/`).
6. Postgres backup job в docker-compose (например, `pg_dump` по крону + upload в S3/B2).

---

## Зависимости между задачами

```
C1 (RBAC)          ──► всё остальное (без RBAC любой фикс бесполезен)
C2 (MacDent sync)  ──► C4 (единый расчёт ФОТ) ──► Celery payroll task
C3 (дублирование)  ──► C5 (серверные остатки)
C6 (soft delete)   ──► независимо, быстро
HTTPS              ──► независимо, параллельно с C1
```

---

## Риски и митигация

| Риск | Вероятность | Митигация |
|---|---|---|
| Миграция `SalaryRule → KPI` теряет данные | Средняя | Написать скрипт проверки до/после; не удалять таблицу до верификации |
| Серверные остатки дают не то же число что раньше | Высокая | Сравнить `propagate_balances` с текущими данными на staging перед деплоем |
| MacDent API меняет формат при переходе на боевой токен | Высокая | `macdent_debug` команда + логировать `raw_response` |
| Оптимистичная блокировка ломает UX при параллельной работе | Низкая | 409 → frontend показывает diff и предлагает merge |
| Удаление `SalaryRule` ломает что-то неизвестное | Низкая | `grep -r SalaryRule` по всему проекту перед удалением |

---

## Метрики успеха по фазам

**После Фазы 0:**
- Врач/регистратор получает 403 на все finance endpoints
- `sync_macdent` на тестовых данных: суммарная выручка = сумма всех платежей
- Переоткрытие любого из 470 дней не меняет месячные итоги

**После Фазы 1:**
- Один `calculate_doctor_salary` сервис — P&L и payroll дают одинаковые числа
- Правка прошлого дня → остатки всех последующих дней обновляются автоматически
- Нет управляющих команд для "починки" данных в рабочем режиме

**После Фазы 2:**
- `profit` на дашборде = операционная прибыль (без займов/капзатрат)
- Celery beat запускается из коробки без ручных действий в admin
- CLAUDE.md описывает реально существующую систему
