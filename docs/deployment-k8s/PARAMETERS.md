# Развертывание VM Inventory в Kubernetes - Параметры и переменные окружения

Справочная документация по всем необходимым параметрам для развертывания приложения.

## Таблица параметров

### Параметры Kubernetes

| Параметр | Тип | Значение по умолчанию | Описание | Пример |
|----------|-----|----------------------|---------|--------|
| `KUBERNETES_NAMESPACE` | string | `vm-inventory` | Kubernetes namespace для приложения | `vm-inventory` |
| `KUBERNETES_CLUSTER` | string | - | Целевой кластер для развертывания | `prod`, `staging`, `dev` |

### Параметры образов Docker

| Параметр | Тип | Значение по умолчанию | Описание | Пример |
|----------|-----|----------------------|---------|--------|
| `DOCKER_REGISTRY` | string | `docker.io` | Registry, откуда берутся образы | `docker.example.com`, `gcr.io`, `docker.io` |
| `BACKEND_IMAGE_TAG` | string | `latest` | Версия/tag backend образа | `latest`, `v1.0.0`, `main-abc123def` |
| `FRONTEND_IMAGE_TAG` | string | `latest` | Версия/tag frontend образа | `latest`, `v1.0.0`, `main-abc123def` |

### Параметры Git

| Параметр | Тип | Значение по умолчанию | Описание | Пример |
|----------|-----|----------------------|---------|--------|
| `GIT_BRANCH` | string | `main` | Git ветка для развертывания | `main`, `development`, `release/v1.0.0` |
| `GIT_REPOSITORY_URL` | string | - | URL Git репозитория | `https://github.com/myorg/vm-inventory.git` |

### Параметры базы данных

| Параметр | Тип | Значение по умолчанию | Описание | Пример |
|----------|-----|----------------------|---------|--------|
| `DATABASE_HOST` | string | `postgres.example.com` | Хост PostgreSQL сервера | `192.168.1.5`, `postgres.example.com` |
| `DATABASE_PORT` | integer | `5432` | Порт PostgreSQL | `5432` (стандартный) |
| `DATABASE_NAME` | string | `vminventory` | Имя базы данных | `vminventory` |
| `DATABASE_USER` | string | `vminventory` | Пользователь БД | `vminventory` |
| `DATABASE_PASSWORD` | string (Secret) | - | Пароль БД | `P@ssw0rd!Secure` |

### Параметры Django

| Параметр | Тип | Значение по умолчанию | Описание | Пример |
|----------|-----|----------------------|---------|--------|
| `SECRET_KEY` | string (Secret) | - | Секретный ключ Django (генерируется) | `django-insecure-...` |
| `DEBUG` | boolean | `false` | Режим отладки (никогда не true в prod!) | `false` |
| `ALLOWED_HOSTS` | string | `localhost,backend,nginx` | Разрешенные хосты для подключения | `vm-inventory.example.com,localhost` |

### Параметры LDAP (опционально)

| Параметр | Тип | Значение по умолчанию | Описание | Пример |
|----------|-----|----------------------|---------|--------|
| `LDAP_URI` | string | `` (пусто - отключено) | URI LDAP сервера | `ldap://ad.example.com:389` |
| `LDAP_BIND_DN` | string | `` | DN для привязки LDAP | `CN=ldapuser,CN=Users,DC=example,DC=com` |
| `LDAP_BIND_PASSWORD` | string (Secret) | `` | Пароль LDAP привязки | `password` |
| `LDAP_USER_SEARCH_BASE` | string | `` | Base DN для поиска пользователей | `CN=Users,DC=example,DC=com` |
| `LDAP_GROUPS_BASE` | string | `` | Base DN для поиска групп | `OU=Groups,DC=example,DC=com` |
| `LDAP_ROLE_GROUP_MAP` | string | `` | Маппинг групп на роли | `admin:cn=admins;analyst:cn=analysts` |

### Параметры аутентификации bootstrap

| Параметр | Тип | Значение по умолчанию | Описание | Пример |
|----------|-----|----------------------|---------|--------|
| `AUTH_BOOTSTRAP_USERNAME` | string | `admin` | Логин первого локального пользователя | `admin` |
| `AUTH_BOOTSTRAP_PASSWORD` | string (Secret) | `P@ssw0rD` | Пароль первого пользователя | `SecurePassword123!` |
| `AUTH_BOOTSTRAP_ROLE` | string | `admin` | Роль bootstrap пользователя | `admin`, `analyst` |

### Параметры масштабирования

| Параметр | Тип | Значение по умолчанию | Описание | Пример |
|----------|-----|----------------------|---------|--------|
| `BACKEND_REPLICAS_MIN` | integer | `2` | Минимальное количество реплик backend | `2` |
| `BACKEND_REPLICAS_MAX` | integer | `10` | Максимальное количество реплик backend | `10` |
| `FRONTEND_REPLICAS_MIN` | integer | `2` | Минимальное количество реплик frontend | `2` |
| `FRONTEND_REPLICAS_MAX` | integer | `5` | Максимальное количество реплик frontend | `5` |
| `BACKEND_CPU_LIMIT` | string | `1000m` | CPU лимит на backend pod | `500m`, `1000m`, `2000m` |
| `BACKEND_MEMORY_LIMIT` | string | `1Gi` | Память лимит на backend pod | `512Mi`, `1Gi`, `2Gi` |
| `FRONTEND_CPU_LIMIT` | string | `500m` | CPU лимит на frontend pod | `100m`, `500m` |
| `FRONTEND_MEMORY_LIMIT` | string | `256Mi` | Памяти лимит на frontend pod | `128Mi`, `256Mi` |

## Примеры конфигураций

### Production окружение

```bash
GIT_BRANCH=main
BACKEND_IMAGE_TAG=v1.0.0
FRONTEND_IMAGE_TAG=v1.0.0
KUBERNETES_CLUSTER=prod
KUBERNETES_NAMESPACE=vm-inventory
RUN_MIGRATIONS=true
ROLLBACK_ON_FAILURE=true
DOCKER_REGISTRY=docker.example.com
DATABASE_HOST=postgres-prod.example.com
DATABASE_PORT=5432
DATABASE_USER=vminventory_prod
DEBUG=false
ALLOWED_HOSTS=vm-inventory.example.com
```

### Development окружение

```bash
GIT_BRANCH=development
BACKEND_IMAGE_TAG=latest
FRONTEND_IMAGE_TAG=latest
KUBERNETES_CLUSTER=dev
KUBERNETES_NAMESPACE=vm-inventory-dev
RUN_MIGRATIONS=true
ROLLBACK_ON_FAILURE=false
DOCKER_REGISTRY=docker.example.com
DATABASE_HOST=postgres-dev.example.com
DATABASE_PORT=5432
DATABASE_USER=vminventory_dev
DEBUG=true
ALLOWED_HOSTS=vm-inventory-dev.example.com,localhost
```

### Staging окружение

```bash
GIT_BRANCH=release/v1.0.0
BACKEND_IMAGE_TAG=v1.0.0-rc1
FRONTEND_IMAGE_TAG=v1.0.0-rc1
KUBERNETES_CLUSTER=staging
KUBERNETES_NAMESPACE=vm-inventory-staging
RUN_MIGRATIONS=true
ROLLBACK_ON_FAILURE=true
DOCKER_REGISTRY=docker.example.com
DATABASE_HOST=postgres-staging.example.com
DATABASE_PORT=5432
DATABASE_USER=vminventory_staging
DEBUG=false
ALLOWED_HOSTS=vm-inventory-staging.example.com
```

## Как сгенерировать/обновить параметры

### Сгенерировать новый Django SECRET_KEY

```bash
# Способ 1: Если у вас установлен Python и Django
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# Способ 2: Через openssl
openssl rand -base64 50

# Способ 3: Через Python без Django
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

### Сгенерировать пароль базы данных

```bash
# Генерирует безопасный пароль
openssl rand -base64 32

# Или более простой вариант
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Убедитесь, что пароль содержит спецсимволы для безопасности
# Хороший пароль: P@ssw0rd!Secure123XyZ
```

## Правила для параметров

### DATABASE_HOST
- ✅ Может быть IP адресом: `192.168.1.5`
- ✅ Может быть доменным именем: `postgres.example.com`
- ✅ Может быть именем сервиса внутри кластера: `postgres` (только если в том же namespace)
- ❌ Не должно включать порт (порт задается отдельно в DATABASE_PORT)
- ❌ Не должно содержать `http://` или другие протоколы

### ALLOWED_HOSTS
- ✅ Разделяются запятой без пробелов: `vm-inventory.example.com,localhost`
- ✅ Могут содержать поддомены: `*.example.com` (для подстановочных доменов)
- ✅ Могут содержать IP адреса: `192.168.1.1`
- ❌ Не должны содержать `http://` или `https://` протоколы

### SECRET_KEY
- ✅ Минимум 50 символов
- ✅ Содержит буквы, цифры, спецсимволы
- ✅ Уникален для каждого окружения
- ❌ Никогда не коммитьте в Git
- ❌ Не используйте одно и то же значение для prod/staging/dev

### Пароли
- ✅ Минимум 12 символов
- ✅ Содержат заглавные буквы, цифры, спецсимволы
- ✅ Примеры: `P@ssw0rd!Secure123`, `MyP@ss99#XyZ`
- ❌ Не используйте простые пароли: `password123`, `admin123`
- ❌ Не содержат имена приложений: не используйте `vm-inventory123`

### DEBUG флаг
- ✅ `false` для production
- ✅ `false` для staging
- ✅ Может быть `true` только для development
- ❌ Никогда `true` в production (раскроет чувствительную информацию!)

## Переменные окружения в Kubernetes

После применения манифестов, параметры становятся доступны как переменные окружения:

```bash
# Просмотреть все env переменные в поде
kubectl -n vm-inventory exec <pod-name> -- env | grep DATABASE

# Результат:
# DATABASE_HOST=postgres.example.com
# DATABASE_PORT=5432
# DATABASE_NAME=vminventory
# DATABASE_USER=vminventory
# DATABASE_URL=postgresql://vminventory:...@postgres.example.com:5432/vminventory
```

## Версионирование параметров

Рекомендуется сохранять параметры для каждого окружения в отдельных файлах:

```
configs/
├── prod.env
├── staging.env
└── dev.env
```

Содержимое `prod.env`:
```bash
GIT_BRANCH=main
BACKEND_IMAGE_TAG=v1.0.0
FRONTEND_IMAGE_TAG=v1.0.0
KUBERNETES_CLUSTER=prod
DATABASE_HOST=postgres-prod.example.com
...
```

Затем используйте:
```bash
source configs/prod.env
# Jenkins автоматически подхватит переменные
```

## Чек-лист перед развертыванием

- [ ] Все параметры получены и проверены
- [ ] DATABASE_HOST может быть пингован из кластера
- [ ] DATABASE_USER существует и может подключиться к БД
- [ ] Docker образы с правильными TAG'ами в registry
- [ ] SECRET_KEY уникален для каждого окружения
- [ ] Пароли соответствуют политике безопасности
- [ ] DEBUG=false для production
- [ ] ALLOWED_HOSTS правильно установлены
- [ ] Образы успешно скачиваются (`docker pull`)
- [ ] Параметры БД совпадают с действительной конфигурацией БД
- [ ] Git репозиторий доступен и содержит нужную ветку
- [ ] Jenkins credentials добавлены и инициализированы

---

**Последняя обновление:** 2024-03-20  
**Версия:** 1.0
