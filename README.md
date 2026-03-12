# VM Inventory System

Веб-приложение для учета виртуальных машин (ВМ) подразделений компании с возможностью группировки в пулы и генерации отчетов.

## Возможности

- **Управление справочниками**: Департаменты → Стримы → Информационные системы
- **Управление ВМ**: CRUD операции с виртуальными машинами, управление тегами (ОС, ИС, кастомные)
- **Общие пулы**: Группировка ВМ в пулы с ограничением по `instance`
- **Отчеты**: Иерархический отчет (Департамент → Стрим → ИС → ВМ) с экспортом в PDF
- **Docker Compose**: Полное развертывание одной командой

## Быстрый старт

### Требования

- Docker и Docker Compose
- Git

### Запуск

1. Клонируйте репозиторий:
```bash
git clone <repository-url>
cd vm-inventory
```

2. Скопируйте `.env.example` в `.env` и при необходимости отредактируйте:
```bash
cp .env.example .env
```

3. Запустите проект:
```bash
docker compose up -d
```

4. Откройте в браузере: http://localhost

### Первый запуск

При первом запуске автоматически выполняются:
- Создание базы данных PostgreSQL
- Применение миграций Django
- Сборка статических файлов
- Сборка фронтенда

**Важно**: При использовании `docker compose up -d` (фоновый режим) убедитесь, что фронтенд успел собраться перед обращением к приложению. При обычном `docker compose up` все сервисы запускаются последовательно.

## Структура проекта

```
vm-inventory/
├── backend/          # Django REST API
│   ├── inventory/    # Основное приложение
│   └── vm_inventory/ # Настройки проекта
├── frontend/         # React SPA (Vite)
├── nginx/           # Конфигурация Nginx
├── docker-compose.yml
└── README.md
```

## Переменные окружения

См. `.env.example` для полного списка. Основные:

### PostgreSQL
- `POSTGRES_DB` — имя базы данных (по умолчанию: `vminventory`)
- `POSTGRES_USER` — пользователь БД (по умолчанию: `vminventory`)
- `POSTGRES_PASSWORD` — пароль БД

### Django
- `SECRET_KEY` — секретный ключ Django (обязательно измените в продакшене!)
- `DEBUG` — режим отладки (`true`/`false`)
- `ALLOWED_HOSTS` — разрешенные хосты (через запятую)

### Auth / RBAC
- `AUTH_BOOTSTRAP_USERNAME` — логин первого локального пользователя (по умолчанию `admin`)
- `AUTH_BOOTSTRAP_PASSWORD` — пароль первого локального пользователя (по умолчанию `P@ssw0rD`)
- `AUTH_BOOTSTRAP_ROLE` — роль bootstrap-пользователя: `admin` или `analyst`
- `AUTH_TOKEN_TTL_MINUTES` — время жизни bearer-токена в минутах

### LDAP (опционально)
- `LDAP_URI` — URI LDAP сервера (если пусто — no-auth)
- `LDAP_BIND_DN` — DN для привязки
- `LDAP_BIND_PASSWORD` — пароль для привязки
- `LDAP_USER_SEARCH_BASE` — база поиска пользователей
- `LDAP_GROUPS_BASE` — база групп

## API

REST API доступен по адресу `/api/`:

- `GET /api/departments/` — список департаментов
- `GET /api/streams/` — список стримов
- `GET /api/info-systems/` — список ИС
- `GET /api/vms/` — список ВМ
- `GET /api/pools/` — список пулов
- `GET /api/report/` — иерархический отчет
- `GET /api/report/pdf/` — экспорт отчета в PDF

Полная документация API доступна через Django Admin: http://localhost/admin/

## Разработка

### Backend (Django)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
# или venv\Scripts\activate  # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### Frontend (React)

```bash
cd frontend
npm install
npm run dev
```

## Модель данных

### Иерархия
- **Department** (Департамент) → **Stream** (Стрим) → **InfoSystem** (ИС) → **VM** (ВМ)

### VM (Виртуальная машина)
- `fqdn` — полное доменное имя (уникальное)
- `cpu`, `ram`, `disk` — ресурсы
- `instance` — номер экземпляра Jenkins (1-20)
- `tags` — массив тегов:
  - [0] — ОС (`LINUX`, `WINDOWS`, `MACOS`)
  - [1] — название ИС (автоматически)
  - [2+] — кастомные теги

### Pool (Пул)
- Группирует ВМ
- Ограничение: все ВМ в пуле должны иметь одинаковое значение `instance`
- История добавления/удаления ВМ хранится в `PoolVM` (поле `removed_at`)

## Безопасность

- В Go backend включена ролевая модель:
  - `admin` — полный доступ
  - `analyst` — доступ только на чтение, включая экспорт отчётов
- Пользователи хранятся локально в БД (`auth_user`)
- При пустой таблице пользователей создаётся bootstrap-аккаунт `admin` с паролем из `AUTH_BOOTSTRAP_PASSWORD` и флагом обязательной смены пароля при первом входе
- Для продакшена рекомендуется:
  - Изменить `AUTH_BOOTSTRAP_PASSWORD`
  - Настроить LDAP (подготовлена таблица `auth_ldap_group_role_map` для сопоставления LDAP-групп и ролей)
  - Использовать HTTPS (см. `docs/DEPLOYMENT.md`)
  - Изменить `SECRET_KEY`
  - Установить `DEBUG=false`

## Документация

- [Инструкция по развертыванию](docs/DEPLOYMENT.md)

## Лицензия

[Укажите лицензию]
