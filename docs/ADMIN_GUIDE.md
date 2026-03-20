# Руководство администратора VM Inventory

## 1. Назначение
Документ описывает:
- развертывание VM Inventory в Docker/Podman;
- создание и администрирование пользователей;
- базовую подготовку к запуску в Kubernetes.

## 2. Развертывание в Docker Compose

### 2.1 Подготовка
```bash
cp .env.example .env
```
Заполните критичные переменные:
- `SECRET_KEY`
- `POSTGRES_PASSWORD`
- `DEBUG=false`
- `ALLOWED_HOSTS`
- `AUTH_BOOTSTRAP_USERNAME`
- `AUTH_BOOTSTRAP_PASSWORD`

### 2.2 Запуск
```bash
docker compose up -d --build
```

### 2.3 Проверка
```bash
docker compose ps
docker compose logs -f backend
```

## 3. Развертывание в Podman
> Возможен запуск через podman-compose с тем же `docker-compose.yml`.

Пример:
```bash
podman compose up -d --build
podman compose ps
```

## 4. Создание пользователей

### 4.1 Через веб-интерфейс
1. Войдите под администратором.
2. Перейдите в **Администрирование → Пользователи**.
3. Нажмите создание пользователя.
4. Укажите:
   - `username`
   - `password`
   - `role` (`administrator` или `analyst`)
   - `is_active`
   - `must_change_password`

### 4.2 Через Django shell (аварийный способ)
```bash
docker compose exec backend python manage.py shell
```
Далее:
```python
from django.contrib.auth.models import User
from inventory.rbac import ensure_user_role
u = User.objects.create_user(username='admin2', password='StrongPass!123')
ensure_user_role(u, 'administrator')
```

## 5. Политика ролей
- **administrator**: полный доступ к CRUD и управлению пользователями.
- **analyst**: доступ на чтение + экспорты.

## 6. Эксплуатация

### 6.1 Миграции
```bash
docker compose exec backend python manage.py migrate
```

### 6.2 Резервное копирование
```bash
docker compose exec db pg_dump -U vminventory vminventory > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 6.3 Восстановление
```bash
docker compose exec -T db psql -U vminventory vminventory < backup_YYYYMMDD_HHMMSS.sql
```

## 7. Подготовка к Kubernetes
Рекомендуемые шаги адаптации:
1. Вынести конфигурацию в `ConfigMap` и секреты в `Secret`.
2. Использовать отдельные Deployments для `backend`, `frontend`, `nginx`.
3. Подключить `PostgreSQL` как managed-service или StatefulSet.
4. Добавить `readinessProbe`/`livenessProbe`.
5. Выполнять миграции как `Job` перед релизом.
6. Использовать `Ingress` + TLS сертификаты.

## 8. Безопасность
- Обязательно смените bootstrap-пароль.
- Используйте HTTPS.
- Ограничьте `ALLOWED_HOSTS`.
- Настройте регулярные бэкапы и ротацию логов.
