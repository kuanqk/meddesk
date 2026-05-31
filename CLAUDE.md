# CLAUDE.md — Стоматологическая клиника (Dental Clinic Platform)

## Обзор проекта

Веб-платформа для управления стоматологической клиникой.
Стартовая точка — планировщик расписания врачей и анестезиологов с P&L расчётами.
Цель — расширяемая система, которая будет включать CRM, финансы, аналитику, запись пациентов.

---

## Стек

| Слой | Технология | Версия |
|---|---|---|
| Backend | Python + Django | 5.x |
| API | Django REST Framework | 3.15+ |
| База данных | PostgreSQL | 15+ |
| Frontend | React + Vite | React 18, Vite 5 |
| Стили | Tailwind CSS | 3.x |
| Авторизация | Django allauth + DRF JWT | — |
| Деплой | gunicorn + nginx | — |
| Контейнеры | Docker + docker-compose | — |
| Хостинг | VPS (существующий хостинг владельца) | — |

---

## Структура проекта

```
clinic/                          # корень репозитория
├── CLAUDE.md                    # этот файл
├── README.md
├── docker-compose.yml
├── .env.example
│
├── backend/                     # Django проект
│   ├── manage.py
│   ├── requirements.txt
│   ├── config/                  # настройки Django
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── local.py
│   │   │   └── production.py
│   │   ├── urls.py
│   │   └── wsgi.py
│   │
│   ├── apps/
│   │   ├── accounts/            # пользователи, роли, клиники
│   │   ├── schedule/            # расписание врачей и кабинетов
│   │   ├── staff/               # врачи, анестезиологи, ставки
│   │   ├── finance/             # P&L, расходы, выручка
│   │   ├── patients/            # (будущее) CRM пациентов
│   │   └── analytics/           # (будущее) дашборд аналитики
│   │
│   └── api/
│       └── v1/                  # все REST endpoints под /api/v1/
│
└── frontend/                    # React + Vite
    ├── package.json
    ├── vite.config.ts
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── scheduler/       # планировщик расписания (из JSX)
    │   │   ├── finance/         # P&L компоненты
    │   │   └── ui/              # общие компоненты
    │   ├── hooks/
    │   ├── api/                 # axios клиент + endpoints
    │   └── types/
    └── public/
```

---

## Django приложения — детали

### `accounts`
- Модели: `User`, `Clinic`, `ClinicMembership`
- Роли: `owner`, `admin`, `doctor`, `anesthesiologist`, `receptionist`
- Мультиклиника: один пользователь может быть в нескольких клиниках
- JWT авторизация через djangorestframework-simplejwt

### `staff`
- Модели: `StaffMember`, `SalaryRule`
- `StaffMember`: имя, роль (doctor/anesthesiologist), цвет, ставка, порог, вычеты
- `SalaryRule`: базовая ставка, повышенная ставка, порог выручки, deduct_implant, deduct_lab
- Расчёт ФОТ вынесен в `staff/salary.py` (чистая функция, покрыта тестами)

### `schedule`
- Модели: `Room`, `WeekTemplate`, `DaySlot`, `HourSlot`
- `Room`: номер кабинета (2, 6, 7 и т.д.)
- `WeekTemplate`: шаблон недели для клиники (можно клонировать по месяцам)
- `DaySlot`: врач + день + кабинет
- `HourSlot`: конкретные часы в `DaySlot`
- Валидация: врачи не пересекаются по кабинету+час, анестезиологи — между собой, но могут пересекаться с врачами

### `finance`
- Модели: `MonthlyExpenses`, `RevenueRecord`
- `MonthlyExpenses`: аренда, маркетинг, материалы, прочее, % наркоза
- `RevenueRecord`: авто-расчёт из расписания (часы × ставка выручки)
- Сервис `finance/calculator.py`: P&L, breakeven, маржа

### `patients` (будущее)
- CRM: карточка пациента, история визитов, задолженности

### `analytics` (будущее)
- Загрузка кресел по периодам
- Выручка по врачам
- Сравнение периодов

---

## API endpoints (v1)

```
POST   /api/v1/auth/login/
POST   /api/v1/auth/refresh/

GET    /api/v1/staff/                    # список сотрудников
POST   /api/v1/staff/                    # добавить сотрудника
PATCH  /api/v1/staff/{id}/              # изменить
DELETE /api/v1/staff/{id}/              # удалить

GET    /api/v1/rooms/                    # кабинеты
POST   /api/v1/rooms/

GET    /api/v1/schedule/week/            # расписание недели
POST   /api/v1/schedule/slot/            # добавить слот
DELETE /api/v1/schedule/slot/{id}/

GET    /api/v1/finance/summary/          # P&L сводка
GET    /api/v1/finance/expenses/
PATCH  /api/v1/finance/expenses/{month}/ # обновить расходы месяца
```

---

## Переменные окружения (.env)

```bash
# Django
SECRET_KEY=your-secret-key-here
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
DJANGO_SETTINGS_MODULE=config.settings.production

# База данных
DATABASE_URL=postgresql://user:password@db:5432/clinic_db

# CORS
CORS_ALLOWED_ORIGINS=https://yourdomain.com

# JWT
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=60
JWT_REFRESH_TOKEN_LIFETIME_DAYS=7
```

---

## Docker (docker-compose.yml)

```yaml
services:
  db:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    env_file: .env

  backend:
    build: ./backend
    command: gunicorn config.wsgi:application --bind 0.0.0.0:8000
    volumes:
      - static_files:/app/staticfiles
    depends_on:
      - db
    env_file: .env

  frontend:
    build: ./frontend
    # собирает dist/ который nginx отдаёт статикой

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf
      - static_files:/staticfiles
      - ./frontend/dist:/usr/share/nginx/html
    depends_on:
      - backend
```

---

## Деплой на хостинг — порядок действий

```bash
# 1. Клонировать репозиторий на сервер
git clone https://github.com/you/clinic.git
cd clinic

# 2. Создать .env из примера
cp .env.example .env
nano .env   # заполнить реальные значения

# 3. Собрать и поднять
docker-compose up -d --build

# 4. Применить миграции
docker-compose exec backend python manage.py migrate

# 5. Создать суперпользователя
docker-compose exec backend python manage.py createsuperuser

# 6. Собрать статику
docker-compose exec backend python manage.py collectstatic --noinput
```

---

## Правила разработки с Claude

### Что всегда указывать в запросах

```
Контекст: [какое приложение — schedule/staff/finance/etc]
Задача: [что нужно сделать]
Файлы: [какие файлы затрагиваются]
```

### Стиль кода

- Python: PEP8, docstrings на русском или английском (выбрать одно)
- Django: fat models, thin views — бизнес-логика в `services.py` или `selectors.py`
- DRF: serializers валидируют, views только HTTP-слой
- React: функциональные компоненты, хуки, TypeScript интерфейсы для всех API-ответов
- Тесты: `pytest-django`, минимум тесты для salary.py и finance/calculator.py

### Что НЕ делать

- Не писать бизнес-логику в views
- Не хранить расписание в localStorage (только API)
- Не смешивать личные финансы с кассой клиники (отдельные модели)
- Не деплоить с DEBUG=True

---

## Текущий статус

| Модуль | Статус |
|---|---|
| Планировщик расписания (React) | ✅ Готов (JSX v2) |
| Django проект | 🔲 Создать |
| Модели staff + schedule | 🔲 Создать |
| REST API | 🔲 Создать |
| Подключить React к API | 🔲 Создать |
| Docker + nginx | 🔲 Создать |
| Деплой на хостинг | 🔲 Ожидает |
| Авторизация | 🔲 Создать |
| Finance модуль | 🔲 Создать |
| Пациенты / CRM | 📋 Бэклог |
| Аналитика / дашборд | 📋 Бэклог |

---

## Следующий шаг

```
Задача: создать Django проект с приложениями staff и schedule,
        базовыми моделями и DRF endpoints для списка сотрудников.
Файлы: backend/config/, backend/apps/staff/, backend/apps/schedule/
```
