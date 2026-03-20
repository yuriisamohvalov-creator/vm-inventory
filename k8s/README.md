# Kubernetes Манифесты для VM Inventory

Здесь находятся все манифесты для развертывания VM Inventory в Kubernetes кластере с внешним сервером БД.

## Структура файлов

| Файл | Описание |
|------|---------|
| `01-namespace.yaml` | Namespace `vm-inventory` для приложения |
| `02-configmap.yaml` | ConfigMap с переменными окружения |
| `03-secret.yaml` | Secret с конфиденциальными данными |
| `04-backend-deployment.yaml` | Deployment для Django backend |
| `05-frontend-deployment.yaml` | Deployment для фронтенда (React) |
| `06-backend-service.yaml` | Service для backend (ClusterIP) |
| `07-frontend-service.yaml` | Service для frontend (LoadBalancer) |
| `08-ingress.yaml` | Ingress для маршрутизации трафика |
| `09-rbac.yaml` | ServiceAccount, ClusterRole и RoleBinding |
| `10-nginx-configmap.yaml` | Конфигурация Nginx |
| `11-hpa.yaml` | HorizontalPodAutoscaler для автомасштабирования |
| `12-network-policies.yaml` | NetworkPolicy для безопасности сети |

## Предварительные требования

1. **Kubernetes кластер** версии 1.20+
2. **kubectl** для управления кластером
3. **Ingress Controller** (например, nginx-ingress)
4. **PostgreSQL сервер** с доступом из кластера
5. **Образы Docker** загруженные в registry:
   - `vm-inventory-backend:latest`
   - `vm-inventory-frontend:latest`

## Быстрый старт

### 1. Подготовка ConfigMap и Secret

Оцените текущие значения в `02-configmap.yaml` и `03-secret.yaml`:
- Установите правильный хост и порт БД (`DATABASE_HOST`, `DATABASE_PORT`)
- Измените пароли (`DATABASE_PASSWORD`, `SECRET_KEY`)
- Укажите домен приложения (`ALLOWED_HOSTS`)

### 2. Развертывание

```bash
# Применить все манифесты по порядку
kubectl apply -f 01-namespace.yaml
kubectl apply -f 02-configmap.yaml
kubectl apply -f 03-secret.yaml
kubectl apply -f 09-rbac.yaml
kubectl apply -f 04-backend-deployment.yaml
kubectl apply -f 05-frontend-deployment.yaml
kubectl apply -f 06-backend-service.yaml
kubectl apply -f 07-frontend-service.yaml
kubectl apply -f 08-ingress.yaml
kubectl apply -f 10-nginx-configmap.yaml
kubectl apply -f 11-hpa.yaml
kubectl apply -f 12-network-policies.yaml

# Или в одну команду
kubectl apply -f . --namespace=vm-inventory
```

### 3. Проверка статуса

```bash
# Проверить статус namespace
kubectl get ns vm-inventory

# Проверить поды
kubectl -n vm-inventory get pods

# Проверить services
kubectl -n vm-inventory get svc

# Логи backend
kubectl -n vm-inventory logs deployment/vm-inventory-backend -f

# Логи frontend
kubectl -n vm-inventory logs deployment/vm-inventory-frontend -f
```

## Настройка внешней БД

В манифестах предполагается подключение к внешнему серверу PostgreSQL. Убедитесь:

1. PostgreSQL сервер доступен с IP:PORT из кластера
2. Создана база данных и пользователь:
```sql
CREATE DATABASE vminventory;
CREATE USER vminventory WITH PASSWORD 'your-secure-password';
ALTER ROLE vminventory SET client_encoding TO 'utf8';
GRANT ALL PRIVILEGES ON DATABASE vminventory TO vminventory;
```

3. Сеть Kubernetes может достичь сервера БД (настроить firewall/security groups)

4. Обновить `02-configmap.yaml`:
```yaml
DATABASE_HOST: "your-db-server.example.com"  # или IP адрес
DATABASE_PORT: "5432"
```

5. Обновить `03-secret.yaml`:
```yaml
DATABASE_PASSWORD: "your-secure-db-password"
```

## Миграции БД

Миграции выполняются автоматически через init контейнер в backend Deployment при каждом развертывании. 

Для ручного запуска миграции:
```bash
kubectl -n vm-inventory run migrate \
  --image=vm-inventory-backend:latest \
  --env="DATABASE_URL=postgresql://..." \
  -- python manage.py migrate --noinput
```

## Масштабирование

Приложение настроено на автоматическое масштабирование через HPA:
- Backend: 2-10 реплик в зависимости от CPU/Memory
- Frontend: 2-5 реплик

Для изменения лимитов отредактируйте `11-hpa.yaml`.

## Обновление приложения

```bash
# 1. Обновить образ в реестре
docker build -t vm-inventory-backend:v1.2.0 ./backend
docker push vm-inventory-backend:v1.2.0

# 2. Обновить deployment
kubectl -n vm-inventory set image deployment/vm-inventory-backend \
  backend=vm-inventory-backend:v1.2.0
```

## Мониторинг и логирование

### Просмотр логов
```bash
# Все поды
kubectl -n vm-inventory logs --all-containers=true deployment/vm-inventory-backend

# Следить за логами в реальном времени
kubectl -n vm-inventory logs -f deployment/vm-inventory-backend
```

### Мониторинг ресурсов
```bash
# Использование CPU/Memory
kubectl -n vm-inventory top pods
kubectl -n vm-inventory top nodes
```

### Описание пода (для отладки проблем)
```bash
kubectl -n vm-inventory describe pod <pod-name>
```

## Безопасность

1. **Secret**: Все пароли хранятся в Secret, а не в ConfigMap
2. **RBAC**: ServiceAccount имеет минимальные необходимые права
3. **NetworkPolicy**: Ограничивает трафик между подами
4. **Security Context**: Поды запускаются с непривилегированными пользователями
5. **Resource Limits**: Установлены лимиты на CPU и Memory для каждого контейнера

## Troubleshooting

### Backend не соединяется с БД
```bash
# Проверить статус backend пода
kubectl -n vm-inventory describe pod <backend-pod-name>

# Проверить логи
kubectl -n vm-inventory logs <backend-pod-name> | grep -i database

# Проверить конфиг БД
kubectl -n vm-inventory get cm vm-inventory-config -o yaml

# Проверить доступность БД с пода
kubectl -n vm-inventory exec <backend-pod-name> -- \
  nc -zv <DATABASE_HOST> <DATABASE_PORT>
```

### Frontend показывает 502 Bad Gateway
```bash
# Проверить статус backend
kubectl -n vm-inventory get pods -l app=vm-inventory-backend

# Проверить доступность backend сервиса
kubectl -n vm-inventory get svc vm-inventory-backend

# Проверить Ingress
kubectl -n vm-inventory get ingress
kubectl -n vm-inventory describe ingress vm-inventory-ingress
```

### Init контейнер зависает при миграциях
```bash
# Проверить логи init контейнера
kubectl -n vm-inventory logs <backend-pod-name> -c migrate

# Увеличить timeout в backend-deployment.yaml
# initialDelaySeconds и periodSeconds в readinessProbe
```

## Полезные команды

```bash
# Удалить все ресурсы
kubectl delete namespace vm-inventory

# Recreate deployment (перезагрузить поды)
kubectl -n vm-inventory rollout restart deployment/vm-inventory-backend
kubectl -n vm-inventory rollout restart deployment/vm-inventory-frontend

# Просмотреть историю deployment
kubectl -n vm-inventory rollout history deployment/vm-inventory-backend

# Откатить на предыдущую версию
kubectl -n vm-inventory rollout undo deployment/vm-inventory-backend
```

## Интеграция с мониторингом и логированием

### Prometheus
Поды помечены аннотациями для Prometheus:
```yaml
prometheus.io/scrape: "true"
prometheus.io/port: "8000"
```

### ELK Stack / Loki
Приложение выводит логи в stdout, которые автоматически собираются системой логирования.

## Дополнительная информация

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Django Deployment Guide](https://docs.djangoproject.com/en/stable/howto/deployment/)
- [Nginx Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
