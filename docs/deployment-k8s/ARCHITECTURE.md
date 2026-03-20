# Архитектура развертывания VM Inventory в Kubernetes

## Диаграмма компонентов

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Kubernetes Cluster                               │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         Namespace: vm-inventory                    │ │
│  │                                                                    │ │
│  │  ┌────────────────────┐      ┌────────────────────┐              │ │
│  │  │  Frontend Pod 1    │      │  Frontend Pod 2    │              │ │
│  │  │ (React + Nginx)    │      │ (React + Nginx)    │              │ │
│  │  │  Port: 80, 443     │      │  Port: 80, 443     │              │ │
│  │  └────────────────────┘      └────────────────────┘              │ │
│  │           │                          │                           │ │
│  │           └──────────────┬───────────┘                           │ │
│  │                          │                                       │ │
│  │            ┌─────────────────────────┐                          │ │
│  │            │ Service (LoadBalancer)  │                          │ │
│  │            │  Type: LoadBalancer     │                          │ │
│  │            │  Port: 80, 443          │                          │ │
│  │            │  External IP: ...       │                          │ │
│  │            └─────────────────────────┘                          │ │
│  │                          │                                       │ │
│  │                          ▼                                       │ │
│  │            ┌─────────────────────────┐                          │ │
│  │            │ Ingress (nginx)         │                          │ │
│  │            │ Host: vm-inventory....  │                          │ │
│  │            │ Routes /api -> backend  │                          │ │
│  │            │ Routes / -> frontend    │                          │ │
│  │            └─────────────────────────┘                          │ │
│  │                  │              │                               │ │
│  │        ┌─────────┘              └──────────┐                    │ │
│  │        │                                   │                    │ │
│  │        ▼                                   ▼                    │ │
│  │  ┌──────────────┐              ┌──────────────┐                │ │
│  │  │ Backend Pod1 │              │ Backend Pod2 │                │ │
│  │  │  (Django)    │              │  (Django)    │                │ │
│  │  │  Port: 8000  │              │  Port: 8000  │                │ │
│  │  │              │              │              │                │ │
│  │  │ Init Container (migrate) │  │ Init Container (migrate) │  │ │
│  │  └──────────────┘              └──────────────┘                │ │
│  │        │                                │                      │ │
│  │        └────────────────┬────────────────┘                      │ │
│  │                         │                                       │ │
│  │            ┌────────────────────────┐                          │ │
│  │            │ Service (ClusterIP)    │                          │ │
│  │            │ Type: ClusterIP        │                          │ │
│  │            │ Port: 8000             │                          │ │
│  │            │ Only internal access   │                          │ │
│  │            └────────────────────────┘                          │ │
│  │                         │                                       │ │
│  │                         ▼                                       │ │
│  │         ┌───────────────────────────┐                          │ │
│  │         │ PostgreSQL (External)     │                          │ │
│  │         │ Host: postgres....        │                          │ │
│  │         │ Port: 5432                │                          │ │
│  │         └───────────────────────────┘                          │ │
│  │                                                                 │ │
│  │  ┌────────────────────────────────────────────────────────┐   │ │
│  │  │ ConfigMap: vm-inventory-config                         │   │ │
│  │  │ - DATABASE_HOST, DATABASE_PORT, DATABASE_NAME         │   │ │
│  │  │ - DEBUG, ALLOWED_HOSTS, LDAP_*                        │   │ │
│  │  └────────────────────────────────────────────────────────┘   │ │
│  │                                                                 │ │
│  │  ┌────────────────────────────────────────────────────────┐   │ │
│  │  │ Secret: vm-inventory-secret                           │   │ │
│  │  │ - SECRET_KEY (Django)                                 │   │ │
│  │  │ - DATABASE_PASSWORD                                   │   │ │
│  │  │ - LDAP_BIND_PASSWORD                                  │   │ │
│  │  │ - AUTH_BOOTSTRAP_* (первый пользователь)            │   │ │
│  │  └────────────────────────────────────────────────────────┘   │ │
│  │                                                                 │ │
│  │  ┌────────────────────────────────────────────────────────┐   │ │
│  │  │ HPA (Horizontal Pod Autoscal)                         │   │ │
│  │  │ - Min replicas: 2, Max: 10 (backend)                 │   │ │
│  │  │ - Min replicas: 2, Max: 5 (frontend)                 │   │ │
│  │  │ - Scale on CPU/Memory metrics                         │   │ │
│  │  └────────────────────────────────────────────────────────┘   │ │
│  │                                                                 │ │
│  │  ┌────────────────────────────────────────────────────────┐   │ │
│  │  │ RBAC & SecurityContext                                │   │ │
│  │  │ - ServiceAccount: vm-inventory                        │   │ │
│  │  │ - Non-root user, read-only filesystem                │   │ │
│  │  │ - NetworkPolicy: ограничение трафика                │   │ │
│  │  └────────────────────────────────────────────────────────┘   │ │
│  │                                                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│                   Outside Cluster                                  │
│  ┌─────────────────────────────────────────────────┐              │
│  │  PostgreSQL Server (External)                   │              │
│  │  Host: postgres.example.com                     │              │
│  │  Port: 5432                                     │              │
│  │  Database: vminventory                          │              │
│  │  User: vminventory                              │              │
│  │                                                 │              │
│  │  ┌─────────────────────────────────────────┐   │              │
│  │  │ VM Inventory Database                   │   │              │
│  │  │ - VMs, Pools, Departments               │   │              │
│  │  │ - Users, Roles, RBAC                    │   │              │
│  │  │ - Reports, Audit logs                   │   │              │
│  │  └─────────────────────────────────────────┘   │              │
│  └─────────────────────────────────────────────────┘              │
│                                                                     │
│  ┌─────────────────────────────────────────────────┐              │
│  │  LDAP Server (Optional)                         │              │
│  │  Host: ldap.example.com                         │              │
│  │  Port: 389 / 636                                │              │
│  │  - Authentication & authorization               │              │
│  └─────────────────────────────────────────────────┘              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     Jenkins Pipeline                                 │
│                                                                      │
│  1. Получение кода   2. Валидация     3. Развертывание              │
│     из Git           манифестов       в Kubernetes                  │
│                                                                      │
│  4. Проверка         5. Smoke tests    6. Отправка                  │
│     подключения БД   приложения       уведомлений                   │
└──────────────────────────────────────────────────────────────────────┘
```

## Поток данных

```
User (Browser)
    │
    │ HTTP/HTTPS request
    ▼
┌─────────────────────────┐
│ LoadBalancer Service    │ (External IP: 192.168.1.20)
│ Port: 80, 443           │
└──────┬──────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Nginx Ingress Controller │ (Routes traffic)
└──────┬───────┬───────────┘
       │       │
   /   │       │ /api/*
      │        │
      ▼        ▼
┌──────────┐  ┌─────────────┐
│ Frontend │  │   Backend   │
│ Pods     │  │   Pods      │
│(React)   │  │   (Django)  │
└──────────┘  └──────┬──────┘
                     │
            Initialize with init container
                  (run migrations)
                     │
                     ▼
          ┌────────────────────┐
          │  PostgreSQL        │
          │  (External Server) │
          └────────────────────┘
```

## Жизненный цикл развертывания

```
1. Jenkins получает код из Git
          │
          ▼
2. Применить Namespace и Secrets
          │
          ▼
3. Применить ConfigMap с конфигурацией
          │
          ▼
4. Применить RBAC и SecurityContext
          │
          ▼
5. Развернуть Backend Deployment
    ├─ Init контейнер: миграция БД
    ├─ Main контейнер: Django/Gunicorn
    └─ Ждать readiness probes
          │
          ▼
6. Развернуть Frontend Deployment
    ├─ Main контейнер: Nginx
    └─ Ждать readiness probes
          │
          ▼
7. Создать Services (Backend - ClusterIP, Frontend - LoadBalancer)
          │
          ▼
8. Создать Ingress для маршрутизации
          │
          ▼
9. Применить HPA (автомасштабирование)
          │
          ▼
10. Применить NetworkPolicy (безопасность)
          │
          ▼
11. Smoke tests - базовая проверка
          │
          ▼
✅ Развертывание завершено
```

## Масштабирование

```
┌─────────────────────────────────────────┐
│  HorizontalPodAutoscaler                │
│  Мониторит метрики каждые 15 сек        │
└──────────────┬──────────────────────────┘
               │
      ┌────────┴────────┐
      │                 │
      ▼                 ▼
CPU > 70%           Memory > 80%
      │                 │
      │    Trigger scale-up
      │                 │
      ▼                 ▼
  Current: 2 replicas
  Action: Add 1-2 replicas
  New: 3-4 replicas
  
  Max: 10 replicas (backend) or 5 (frontend)
```

## Механизм Healthcheck

```
┌─────────────────────────────────────┐
│  Kubernetes Liveness Probe          │
│  - Проверяет каждые 10 сек          │
│  - GET /admin/login/ HTTP/1.1       │
│  - Timeout: 5 сек                   │
│  - Fail count: 3 попытки            │
├─────────────────────────────────────┤
│  Action: Если fails -> Pod restart  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Kubernetes Readiness Probe         │
│  - Проверяет каждые 5 сек           │
│  - GET /admin/login/ HTTP/1.1       │
│  - Fail count: 2 попытки            │
├─────────────────────────────────────┤
│  Action: Если fails -> Remove from  │
│          Service (но не restart)    │
└─────────────────────────────────────┘
```

## Безопасность персоналия

```
┌──────────────────────────────────────┐
│  Network Policies                    │
├──────────────────────────────────────┤
│                                      │
│  Frontend Pod:                       │
│    ✓ Ingress from external          │
│    ✓ Egress to Backend              │
│    ✓ Egress to DNS (53)             │
│    ✗ Прямой доступ к БД            │
│                                      │
│  Backend Pod:                        │
│    ✓ Ingress from Frontend          │
│    ✓ Egress to Database            │
│    ✓ Egress to DNS (53)            │
│    ✗ Доступ из интернета           │
│                                      │
│  Database:                           │
│    ✓ Доступна только Backend        │
│    ✗ Доступна из интернета         │
│                                      │
└──────────────────────────────────────┘
```

## Миграция данных

```
Database Migration Flow:

1. Backend Deployment обновлен
   │
   ▼
2. Init Container запускается ПЕРЕД main контейнером
   │
   ▼
3. python manage.py migrate --noinput
   - Проверяет текущую версию схемы БД
   - Применяет новые миграции
   - Создает новые таблицы/поля
   │
   ▼
4. Main контейнер запускается только после успеха init
   │
   ▼
5. Django готов обрабатывать запросы
```

## Восстановление при ошибке

```
Development/Staging:
  Deploy fail
    │
    ▼
  Manual review
    │
    ├─ Fix code/config
    └─ Redeploy

Production:
  Deploy fail
    │
    ▼
  Auto rollback (if enabled)
    │
    ▼
  Return to previous version
    │
    ▼
  Alert team
    │
    └─ Manual review & fix
       Redeploy when ready
```

## Performance характеристики

```
Request Timeline (ms):

User Request
  │
  ├─ DNS lookup: ~5ms
  ├─ TLS handshake: ~10-20ms
  ├─ Nginx processing: ~2-5ms
  └─ Django processing: ~50-200ms (in-memory)
       ├─ Request routing: ~5ms
       ├─ Middleware: ~10ms
       ├─ View processing: ~20ms
       └─ Database query: ~15ms
  └─ Total: ~70-250ms

Response (with caching):
  - Frontend static files: HTTP 304 (cached)
  - API responses: JSON with ETag
  - Database: Connection pooling
```

---

**Версия документа:** 1.0  
**Последний обновление:** 2024-03-20
