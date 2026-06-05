# MedDesk — Progress Report

**Дата:** 2026-06-05
**Деплой:** http://91.243.71.139:8090
**Стек:** Django 5.2 · DRF · Postgres 15 · React 18 · Vite 5 · Docker Compose

---

## 🚀 Что задеплоено и работает

### Аутентификация
- JWT login/refresh через `simple-jwt`
- `/api/v1/auth/me/` отдаёт `{ user, role, tabs[] }`
- Матрица «роль → вкладки» в `RoleTabAccess` (БД), правится из UI
  владельцем на `/settings`
- Доступные роли: owner / admin / doctor / anesthesiologist / receptionist

### Планировщик расписания
- React-компонент `ClinicScheduler` подключён к API
- Снапшот хранится в `apps.schedule.SchedulerState` (JSON)
- Список сотрудников подгружается из `/api/v1/staff/`
- Кнопки навигации `💰 Финансы` и `⚙️ Настройки` в шапке

### Финансы
- **Импортировано исторических данных:**
  - **470 дней** (Январь 2025 — Июнь 2026)
  - **9 969 транзакций**
  - Источник: 6 квартальных xlsx-файлов из `local/СЧЕТ 20{25,26}-{I,II,III,IV}-квартал.xlsx`
- **Закрыты от редактирования:** все импортированные дни через
  `python manage.py close_imported_days`
- **Балансы пересчитаны:** через `python manage.py recalculate_balances`
  `balance_end = balance_start + Σincome − Σexpense` по каждому счёту
- **Dashboard** `/finance` показывает:
  - 4 KPI карточки (выручка / расходы / прибыль / остаток)
  - Бар-чарт по месяцам (pure CSS)
  - Sparklines остатков по счетам (Kaspi / Halyk / Cash)
  - Топ-N категорий расходов (Зарплаты / Материалы / Аренда / Комиссии / Наркоз / Прочее)
- **Daily input** `/finance` → вкладка «📝 Ввод дня»:
  - Навигация по дням стрелками + `<input type="date">`
  - Opening / closing balances считаются live
  - 3 секции счетов с inline-добавлением строк, autocomplete комментариев
  - Закрытие/переоткрытие дня (owner-only)
  - Offline-очередь сохранения через `navigator.onLine`

### MacDent
- Клиент `apps/finance/services/macdent.py` работает на **тестовом** токене
  `1196:1:...` → endpoints `payment/find`, `rashodi/find`, `zapis/find`,
  `doctor/find`, `rasp/find`
- Команды: `sync_macdent --from --to`, `macdent_debug`
- **Боевой токен от клиники ещё не получен.**

---

## 📊 Данные в БД

| Таблица | Записей |
|---|---|
| `DailyReport` | 470 |
| `DailyTransaction` | 9 969 |
| `DailyBalance` | ~1 410 (3 счёта × 470 дней) |
| `StaffMember` | 0 (тестовая клиника) |
| `MacDentSync` | 0 (sync не запускался на проде) |

Все `DailyReport` помечены `is_closed=True`, `source_file=СЧЕТ XXXX-X-квартал.xlsx`.

---

## ⚠️ Известные проблемы и ограничения

1. **MacDent токен** — пока тестовый, реальной синхронизации не было.
   Нужно: получить от клиники токен → выполнить `doctor/find` → заполнить
   `StaffMember.macdent_id` для каждого врача.

2. **Celery не подключён** — автосинхронизация не работает,
   `sync_macdent` запускается только вручную.

3. **Категоризация транзакций** — сейчас по keyword-фильтрам в коде
   (`Q(comment__icontains=...)`). Справочник `TransactionCategory`
   в БД есть, но не используется. Автокатегоризации при ручном вводе нет.

4. **ФОТ UI** — модель `PayrollCalculation` готова, сервис расчёта
   готов, но UI (вкладка Payroll + DoctorPayrollCard + confirm-кнопка) ещё нет.

5. **Аналитика по врачам** — нет dashboard'а с KPI-прогрессом,
   стеком оборотов, выручкой/час.

6. **Один пользователь = один кабинет в день** — модель `DailyReport`
   не привязана к `Room`. В архитектуре было заложено, но не сделано
   (пока не нужно — кассовая книга общая на клинику).

---

## 🛠 Принятые технические решения

### 1. Multi-day Excel sheets → LAST date
Листы вида `Расчеты 30-31.05.26` или `Расчеты 28.04-01.05.26` (cross-month)
парсятся в **последний** день диапазона, а не первый. Раньше брался первый.
Команда `import_excel --reparse-ranges` пере-импортирует только эти листы,
удаляя ранее импортированные записи по первой дате.

### 2. Cash-basis P&L
Все финансы считаются по факту прихода/расхода через кассу/счета
(`DailyTransaction.direction = income | expense`). Accrual-схема
(счета-фактуры, дебиторка) не вводится — в стоматологии расчёт почти
всегда наличными или сразу после визита.

### 3. Категории расходов — keyword fallback, не справочник
Пока не хватает данных для калибровки `TransactionCategory.keywords`.
Используем хардкоженные `Q(comment__icontains=...)` в `views.py:EXPENSE_CATEGORIES`.
Когда наберём статистику ошибок категоризации — заведём fixtures
для `TransactionCategory` и переведём логику на него.

### 4. RoleTabAccess в БД (не код)
Изначально матрица была хардкодом в `permissions.py:TAB_ACCESS`.
Перенесли в БД с `@lru_cache` + `post_save` инвалидацией, чтобы owner
мог менять права из UI без релиза. Hardcoded словарь остался как fallback.

### 5. Closing balances — computed, not imported
Excel-таблицы содержали свои closing balances (правый блок «остатки на
конец дня»), но в данных бывают опечатки/округления. Теперь
`DailyBalance.balance_end` всегда **вычисляется** из `balance_start + Σtxns`.
Это гарантирует, что цепочка дней согласована.

### 6. Gap-day balance lookup
При запросе дня, на который нет `DailyReport` (выходной, праздник),
opening balance ищется per-account — самый свежий `DailyBalance.balance_end`
**до этой даты**. Это правильно мостит пропуски, даже если за разные счета
последняя запись была в разные дни.

### 7. Owner-only mutations
Закрытие дня, переоткрытие дня, изменение `RoleTabAccess` — только
`is_superuser or role='owner'`. Проверка через
`ClinicMembership.objects.filter(user=u, role=OWNER, is_active=True).exists()`.

### 8. Excel import = `source="excel"`, manual input = `source="manual"`
`DailyTransaction.source` различает источники, чтобы переcохранение через
`POST /daily-report/` не затирало импорт. На GET листинг по дням фильтрует
`source='manual'`, чтобы при редактировании старого импорта не дублировать
строки в форме.

---

## 🎯 Следующие шаги (по приоритету)

1. **Боевой MacDent токен** → реальная синхронизация
2. **Celery + Redis** → автоматический sync каждый час
3. **PayrollTab UI** → owner подтверждает ФОТ каждый месяц
4. **DoctorsTab** → стек оборотов, KPI-прогресс
5. **Автокатегоризация** на основе истории комментариев

---

## 📁 Структура проекта

```
backend/
├── apps/
│   ├── accounts/      User, Clinic, ClinicMembership, RoleTabAccess
│   ├── staff/         StaffMember + SalaryRule + salary.py
│   ├── schedule/      Room, WeekTemplate, DaySlot, HourSlot, SchedulerState
│   └── finance/       7 моделей + MacDentClient + import_excel/recalc/close
│
└── api/v1/
    ├── auth/          login/refresh/me
    ├── staff/         CRUD
    ├── scheduler/     state GET/PUT
    ├── settings/      tabs/, permissions/
    └── finance/       summary/daily/expenses/balances + daily-report/...

frontend/src/
├── pages/             LoginPage, FinancePage, SettingsPage
├── components/
│   ├── scheduler/     ClinicScheduler
│   └── finance/       DailyInputTab
├── api/               client.ts (axios + JWT refresh) + per-domain modules
├── types/             auth, finance, settings, staff, scheduler
└── context/           AuthContext
```
