# MedDesk — платформа управления стоматологической клиникой

## Быстрый старт (локально)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export DJANGO_SETTINGS_MODULE=config.settings.local
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173  
API: http://localhost:8000/api/v1/

## Docker (production)

```bash
cp .env.example .env
# отредактируйте .env — SECRET_KEY, домен, пароли

docker compose up -d --build
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py collectstatic --noinput
```

Приложение будет доступно на порту 8090 (или на порту из `docker-compose.yml`).

Данные планировщика хранятся в PostgreSQL (volume `postgres_data`) через `PUT /api/v1/scheduler/state/`.

**Безопасное обновление на сервере** (данные не удаляются):

```bash
git pull
docker compose up -d --build
docker compose exec backend python manage.py migrate
```

Не используйте `docker compose down -v` — флаг `-v` удалит базу данных.

## Авторизация

Вход по логину и паролю (JWT). После входа вкладки фильтруются по роли:

| Роль | Вкладки |
|---|---|
| owner, admin | все |
| doctor, anesthesiologist | Расписание, По дням |
| receptionist | Расписание, По дням, Кабинеты |

Суперпользователь Django видит все вкладки. Для обычных пользователей создайте **Clinic** и **Clinic membership** в `/admin/` с нужной ролью.

```bash
docker compose exec backend python manage.py createsuperuser
```

## API

| Метод | URL | Описание |
|---|---|---|
| GET | `/api/v1/staff/` | Список сотрудников |
| POST | `/api/v1/staff/` | Добавить сотрудника |
| PATCH | `/api/v1/staff/{id}/` | Изменить |
| DELETE | `/api/v1/staff/{id}/` | Удалить |
| GET | `/api/v1/scheduler/state/` | Загрузить расписание |
| PUT | `/api/v1/scheduler/state/` | Сохранить расписание |
| POST | `/api/v1/auth/login/` | JWT login |
| POST | `/api/v1/auth/refresh/` | JWT refresh |
| GET | `/api/v1/auth/me/` | Текущий пользователь и доступные вкладки |

## Тесты

```bash
cd backend
pytest
```
