# Инструкция по развертыванию VM Inventory System

## Продакшен-развертывание

### 1. Подготовка

1. Склонируйте репозиторий на сервер
2. Скопируйте `.env.example` в `.env` и заполните переменные:
   ```bash
   cp .env.example .env
   nano .env
   ```

3. **Обязательно измените**:
   - `SECRET_KEY` — сгенерируйте новый ключ (например, `python -c "import secrets; print(secrets.token_urlsafe(50))"`)
   - `POSTGRES_PASSWORD` — надежный пароль
   - `DEBUG=false`
   - `ALLOWED_HOSTS` — укажите ваш домен

### 2. Настройка HTTPS (SSL/TLS)

#### Вариант A: Использование существующих сертификатов

1. Создайте директорию `nginx/ssl/`:
   ```bash
   mkdir -p nginx/ssl
   ```

2. Поместите сертификаты:
   - `nginx/ssl/cert.pem` — сертификат
   - `nginx/ssl/key.pem` — приватный ключ

3. Обновите `nginx/nginx.conf`, добавив блок HTTPS сервера (см. пример ниже)

#### Вариант B: Самоподписанный сертификат (только для тестирования)

```bash
mkdir -p nginx/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -subj "/CN=localhost"
```

#### Пример блока HTTPS для nginx.conf

Добавьте после блока `server { listen 80; ... }`:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /var/www/frontend;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_redirect off;
    }

    location /admin/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /static/ {
        alias /var/www/static/;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 3. Настройка LDAP (опционально)

Если требуется аутентификация через LDAP:

1. Установите переменные в `.env`:
   ```env
   LDAP_URI=ldap://ldap.example.com:389
   LDAP_BIND_DN=cn=admin,dc=example,dc=com
   LDAP_BIND_PASSWORD=your-password
   LDAP_USER_SEARCH_BASE=ou=users,dc=example,dc=com
   LDAP_GROUPS_BASE=ou=groups,dc=example,dc=com
   ```

2. Реализуйте метод `authenticate` в `backend/vm_inventory/auth_ldap.py` (сейчас это заглушка)

3. Перезапустите backend:
   ```bash
   docker compose restart backend
   ```

### 4. Запуск

```bash
docker compose up -d
```

Проверьте логи:
```bash
docker compose logs -f
```

### 5. Проверка

- Откройте http://your-domain (или https://your-domain)
- Проверьте API: `curl http://your-domain/api/departments/`
- Проверьте админку: http://your-domain/admin/

## Резервное копирование базы данных

### Создание бэкапа

```bash
docker compose exec db pg_dump -U vminventory vminventory > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Восстановление

```bash
docker compose exec -T db psql -U vminventory vminventory < backup_YYYYMMDD_HHMMSS.sql
```

## Обновление

1. Остановите контейнеры:
   ```bash
   docker compose down
   ```

2. Создайте бэкап БД (см. выше)

3. Обновите код:
   ```bash
   git pull
   ```

4. Пересоберите образы:
   ```bash
   docker compose build --no-cache
   ```

5. Запустите:
   ```bash
   docker compose up -d
   ```

6. Примените миграции (если есть новые):
   ```bash
   docker compose exec backend python manage.py migrate
   ```

## Мониторинг

### Логи

```bash
# Все сервисы
docker compose logs -f

# Конкретный сервис
docker compose logs -f backend
docker compose logs -f nginx
```

### Статус контейнеров

```bash
docker compose ps
```

### Использование ресурсов

```bash
docker stats
```

## Устранение неполадок

### Фронтенд не загружается

1. Проверьте, что фронтенд собрался:
   ```bash
   docker compose logs frontend
   ```

2. Если нужно пересобрать:
   ```bash
   docker compose up -d --build frontend
   ```

### База данных не подключается

1. Проверьте переменные окружения в `.env`
2. Проверьте логи БД:
   ```bash
   docker compose logs db
   ```
3. Убедитесь, что БД запущена:
   ```bash
   docker compose exec db pg_isready -U vminventory
   ```

### Миграции не применяются

Выполните вручную:
```bash
docker compose exec backend python manage.py migrate
```

### Nginx возвращает 502 Bad Gateway

1. Проверьте, что backend запущен:
   ```bash
   docker compose ps backend
   ```

2. Проверьте логи backend:
   ```bash
   docker compose logs backend
   ```

3. Проверьте доступность backend из nginx:
   ```bash
   docker compose exec nginx wget -O- http://backend:8000/api/
   ```

### Проблемы с правами доступа

Если возникают ошибки записи в volumes:
```bash
sudo chown -R $USER:$USER .
```

## Производительность

### Оптимизация PostgreSQL

Добавьте в `docker-compose.yml` для сервиса `db`:
```yaml
command: postgres -c shared_buffers=256MB -c max_connections=200
```

### Оптимизация Gunicorn

В `docker-compose.yml` для `backend` измените количество воркеров:
```yaml
command: >
  sh -c "... && gunicorn vm_inventory.wsgi:application --bind 0.0.0.0:8000 --workers 4"
```

## Безопасность в продакшене

1. ✅ Используйте HTTPS
2. ✅ Настройте LDAP или другую аутентификацию
3. ✅ Измените `SECRET_KEY`
4. ✅ Установите `DEBUG=false`
5. ✅ Ограничьте `ALLOWED_HOSTS`
6. ✅ Используйте надежные пароли для БД
7. ✅ Регулярно обновляйте зависимости
8. ✅ Настройте файрвол (откройте только 80/443)
9. ✅ Регулярно создавайте бэкапы БД

## Поддержка

При возникновении проблем:
1. Проверьте логи: `docker compose logs`
2. Проверьте документацию в `README.md`
3. Создайте issue в репозитории с описанием проблемы и логами
