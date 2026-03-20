# Решение: Развертывание VM Inventory в Kubernetes с внешней БД

## 📋 Краткое описание

Подготовлено полноценное решение для развертывания приложения **VM Inventory** в кластере **Kubernetes** с отдельным сервером **PostgreSQL**.

Включает:
- ✅ 12 Kubernetes манифестов (YAML файлы)
- ✅ Job DSL скрипт для Jenkins (автоматизация)
- ✅ Jenkinsfile для pipeline (детальный workflow)
- ✅ Подробная инструкция для junior администратора
- ✅ Справочная документация по параметрам
- ✅ Диаграммы архитектуры

---

## 📁 Структура решения

```
vm-inventory/
├── k8s/                              # Kubernetes манифесты
│   ├── 01-namespace.yaml             # namespace: vm-inventory
│   ├── 02-configmap.yaml             # Конфигурация приложения
│   ├── 03-secret.yaml                # Конфиденциальные данные
│   ├── 04-backend-deployment.yaml    # Django backend
│   ├── 05-frontend-deployment.yaml   # React + Nginx frontend
│   ├── 06-backend-service.yaml       # Service для backend
│   ├── 07-frontend-service.yaml      # LoadBalancer для frontend
│   ├── 08-ingress.yaml               # Ingress маршрутизация
│   ├── 09-rbac.yaml                  # ServiceAccount & RBAC
│   ├── 10-nginx-configmap.yaml       # Nginx конфиг
│   ├── 11-hpa.yaml                   # Автомасштабирование
│   ├── 12-network-policies.yaml      # Безопасность сети
│   └── README.md                     # Документация манифестов
│
├── jenkins/                          # Jenkins Job DSL и Pipeline
│   ├── VmInventoryDeployPipeline.groovy  # Job DSL скрипт
│   ├── Jenkinsfile.k8s               # Declarative Pipeline
│   └── README.md                     # Инструкция по настройке Jenkins
│
└── docs/deployment-k8s/              # Документация для администратора
    ├── JUNIOR_ADMIN_GUIDE.md         # Инструкция для junior админа
    ├── PARAMETERS.md                 # Справочник параметров
    └── ARCHITECTURE.md               # Диаграммы архитектуры
```

---

## 🚀 Быстрый старт

### Вариант 1: Через Jenkins (РЕКОМЕНДУЕТСЯ)

```bash
1. Откройте Jenkins: http://jenkins.example.com:8080
2. Найдите job: vm-inventory-deploy-k8s
3. Нажмите: "Build with Parameters"
4. Заполните параметры:
   - GIT_BRANCH: main
   - BACKEND_IMAGE_TAG: latest
   - KUBERNETES_CLUSTER: prod (или staging/dev)
   - DATABASE_HOST: postgres.example.com
5. Нажмите: "Build"
6. Следите за прогрессом в логах
```

### Вариант 2: Механическое развертывание

```bash
# 1. Перейти в папку k8s
cd k8s

# 2. Отредактировать конфигурацию
nano 02-configmap.yaml    # Параметры подключения БД
nano 03-secret.yaml       # Пароли

# 3. Переключиться на правильный контекст
kubectl config use-context kubernetes-prod

# 4. Применить манифесты
kubectl apply -f 01-namespace.yaml
kubectl apply -f 02-configmap.yaml
kubectl apply -f 03-secret.yaml
kubectl apply -f 09-rbac.yaml
kubectl apply -f 10-nginx-configmap.yaml
kubectl apply -f 04-backend-deployment.yaml
kubectl -n vm-inventory rollout status deployment/vm-inventory-backend --timeout=5m
kubectl apply -f 05-frontend-deployment.yaml
kubectl -n vm-inventory rollout status deployment/vm-inventory-frontend --timeout=5m
kubectl apply -f 06-backend-service.yaml
kubectl apply -f 07-frontend-service.yaml
kubectl apply -f 08-ingress.yaml
kubectl apply -f 11-hpa.yaml
kubectl apply -f 12-network-policies.yaml

# 5. Проверить статус
kubectl -n vm-inventory get pods
```

---

## 📚 Документация

### Для Junior Администраторов
**→ Читайте:** [docs/deployment-k8s/JUNIOR_ADMIN_GUIDE.md](docs/deployment-k8s/JUNIOR_ADMIN_GUIDE.md)

Содержит:
- ✅ Предварительные требования
- ✅ Пошаговые инструкции
- ✅ Проверку окружения
- ✅ Обработку ошибок
- ✅ FAQ
- ✅ Контрольный чек-лист

### Для DevOps инженеров
**→ Читайте:** [k8s/README.md](k8s/README.md)

Содержит:
- ✅ Структуру манифестов
- ✅ Настройку внешней БД
- ✅ Миграции и мониторинг
- ✅ Обновление приложения
- ✅ Troubleshooting для опытных

### Для Jenkins администраторов
**→ Читайте:** [jenkins/README.md](jenkins/README.md)

Содержит:
- ✅ Установку Job DSL
- ✅ Настройку credentials
- ✅ Конфигурацию Jenkins
- ✅ Интеграцию с CI/CD

### Справочная документация
- **PARAMETERS.md** - все параметры и их значения
- **ARCHITECTURE.md** - диаграммы и архитектура решения

---

## 🔧 Ключевые компоненты

### Kubernetes Манифесты

| Файл | Компонент | Назначение |
|------|-----------|-----------|
| `01-namespace.yaml` | Namespace | Изоляция ресурсов приложения |
| `02-configmap.yaml` | ConfigMap | Переменные окружения (публичные) |
| `03-secret.yaml` | Secret | Пароли и ключи (конфиденциально) |
| `04-backend-deployment.yaml` | Deployment | Django backend на 2+ репликах |
| `05-frontend-deployment.yaml` | Deployment | React + Nginx на 2+ репликах |
| `06-backend-service.yaml` | Service | ClusterIP для backend (только внутри) |
| `07-frontend-service.yaml` | Service | LoadBalancer для frontend (внешний доступ) |
| `08-ingress.yaml` | Ingress | Маршрутизация к backend/frontend |
| `09-rbac.yaml` | RBAC | Управление доступом подов |
| `10-nginx-configmap.yaml` | ConfigMap | Конфиг Nginx (кэширование, proxy) |
| `11-hpa.yaml` | HPA | Автомасштабирование (2-10 replicas) |
| `12-network-policies.yaml` | NetworkPolicy | Ограничение трафика между подами |

### Jenkins Pipeline

**VmInventoryDeployPipeline.groovy:**
- Создает job `vm-inventory-deploy-k8s` в Jenkins
- Параметризированная job для гибкого развертывания
- Поддержка prod/staging/dev кластеров

**Jenkinsfile.k8s:**
- 16+ этапов развертывания
- Автоматическая валидация манифестов
- Проверка подключения к БД ДО развертывания
- Откат при ошибке
- Smoke тесты
- Email уведомления

---

## ⚙️ Архитектура

### Сетевая топология

```
Internet
   │
   ▼
LoadBalancer Service (80, 443)
   │
   ▼
Nginx Ingress Controller
   ├─ / → Frontend Pods
   └─ /api/* → Backend Pods
       │
       ▼
   Backend Pods (Django/Gunicorn)
       │
       ├─ Init container (миграции БД)
       └─ Main контейнер (8000 port)
           │
           ▼
   ┌─────────────────────┐
   │ PostgreSQL (External)│
   │ postgres.example.com│
   │ Port: 5432          │
   └─────────────────────┘
```

### Жизненный цикл пода

```
┌──────────────────┐
│ Init Container   │ (run migrations)
└────────┬─────────┘
         │ (success)
         ▼
┌──────────────────┐
│ Main Container   │ (Django app)
│                  │
│ Liveness probe   │ (10s interval)
│ Readiness probe  │ (5s interval)
└──────────────────┘
```

### Масштабирование

**Backend:**
- Min: 2 replicas
- Max: 10 replicas
- Metric: CPU > 70% или Memory > 80%

**Frontend:**
- Min: 2 replicas
- Max: 5 replicas
- Metric: CPU > 75% или Memory > 85%

---

## 🔐 Безопасность

### Реализовано:

1. **Secret Management** - пароли в Secret, не в ConfigMap
2. **RBAC** - ServiceAccount с минимальными правами
3. **NetworkPolicy** - ограничение трафика между подами
4. **Security Context** - non-root пользователи, read-only filesystem
5. **Resource Limits** - ограничение CPU и Memory
6. **Health Checks** - liveness и readiness probes

### Безопасность сети (NetworkPolicy):
- Frontend может говорить только с Backend
- Backend может говорить только с БД
- Нет доступа из интернета напрямую
- DNS разрешены всем

---

## 📊 Мониторинг и логирование

### Встроенное:

```bash
# Просмотреть логи
kubectl -n vm-inventory logs deployment/vm-inventory-backend -f

# Статус подов
kubectl -n vm-inventory get pods -o wide

# Использование ресурсов
kubectl -n vm-inventory top pods

# События
kubectl -n vm-inventory get events
```

### Интеграция с системами:

- **Prometheus**: автоматические аннотации для скрепинга
- **ELK/Loki**: логи из stdout
- **Datadog/NewRelic**: поддержка метрик Kubernetes

---

## 🔄 Develop → Staging → Production

### Workflow по окружениям:

```bash
# Development
GIT_BRANCH=development
KUBERNETES_CLUSTER=dev
DEBUG=true  # только для dev!

# Staging (перед production)
GIT_BRANCH=release/v1.0.0
KUBERNETES_CLUSTER=staging
DEBUG=false

# Production
GIT_BRANCH=main
KUBERNETES_CLUSTER=prod
DEBUG=false
RUN_MIGRATIONS=true
ROLLBACK_ON_FAILURE=true
```

---

## ❓ Часто задаваемые вопросы

### Q: Как обновить версию приложения?

```bash
# Через Jenkins:
Build with Parameters:
  BACKEND_IMAGE_TAG: v1.0.1
  FRONTEND_IMAGE_TAG: v1.0.1

# Вручную:
kubectl -n vm-inventory set image deployment/vm-inventory-backend \
  backend=docker.example.com/vm-inventory-backend:v1.0.1
```

### Q: Как откатить на предыдущую версию?

```bash
kubectl -n vm-inventory rollout undo deployment/vm-inventory-backend
kubectl -n vm-inventory rollout undo deployment/vm-inventory-frontend
```

### Q: Как изменить пароль БД?

```bash
# 1. Изменить в самой БД
psql -h postgres.example.com -U vminventory -d vminventory
> ALTER USER vminventory WITH PASSWORD 'new-password';

# 2. Обновить Secret в Kubernetes
kubectl -n vm-inventory edit secret vm-inventory-secret
# (изменить DATABASE_PASSWORD)

# 3. Перезагрузить deployment
kubectl -n vm-inventory rollout restart deployment/vm-inventory-backend
```

### Q: Как добавить еще реплик?

```bash
# Вручную (HPA может переопределить)
kubectl -n vm-inventory scale deployment vm-inventory-backend --replicas=5

# Или отредактировать HPA в 11-hpa.yaml
kubectl -n vm-inventory edit hpa vm-inventory-backend-hpa
# (изменить maxReplicas)
```

### Q: Где хранятся данные?

```
Все данные хранятся в PostgreSQL на внешнем сервере.
Kubernetes pods используют ephemeral storage (временное).

Если нужно резервное копирование - настройте backup БД!
```

---

## 🎯 Предварительные требования

### На рабочей машине администратора:
- ✅ kubectl
- ✅ curl
- ✅ Git

### На Kubernetes кластере:
- ✅ Версия 1.20+
- ✅ Ingress Controller (nginx-ingress)
- ✅ Metrics Server (для HPA)

### На сервере БД:
- ✅ PostgreSQL 11+
- ✅ Доступность с IP кластера Kubernetes
- ✅ Созданная база `vminventory`
- ✅ Созданный пользователь `vminventory`

### Docker Registry:
- ✅ Образы `vm-inventory-backend` и `vm-inventory-frontend`
- ✅ С версионированными tags

---

## 📖 Пошаговая инструкция (краткая)

### Шаг 1: Подготовка
```bash
# Получить параметры
# - IP Kubernetes сервера
# - IP/домен PostgreSQL
# - Пароли
```

### Шаг 2: Конфигурация
```bash
cd k8s
nano 02-configmap.yaml    # DATABASE_HOST, ALLOWED_HOSTS
nano 03-secret.yaml       # DATABASE_PASSWORD, SECRET_KEY
```

### Шаг 3: Развертывание
```bash
# Вариант A: Jenkins
# Build job "vm-inventory-deploy-k8s" с параметрами

# Вариант B: kubectl
kubectl config use-context kubernetes-prod
kubectl apply -f k8s/
```

### Шаг 4: Проверка
```bash
kubectl -n vm-inventory get pods
kubectl -n vm-inventory get svc
curl http://<EXTERNAL-IP>/
```

---

## 🆘 Решение проблем

### Проблема: Pod в статусе Pending
```bash
kubectl -n vm-inventory describe pod <pod-name>
# Смотрите "Events" секцию - там причина
```

### Проблема: Pod крашится (CrashLoopBackOff)
```bash
kubectl -n vm-inventory logs <pod-name>
# Смотрите последние строки - там ошибка
```

### Проблема: Backend не может подключиться к БД
```bash
# Проверить параметры
kubectl -n vm-inventory get cm vm-inventory-config -o yaml | grep DATABASE_

# Проверить доступность БД
kubectl -n vm-inventory run test --image=postgres:16 --rm -it -- \
  psql -h postgres.example.com -U vminventory -d vminventory
```

---

## 📞 Техническая поддержка

**Для Junior Администраторов:**
→ Читайте [JUNIOR_ADMIN_GUIDE.md](docs/deployment-k8s/JUNIOR_ADMIN_GUIDE.md) 
Там 90% ответов на вопросы!

**Для опытных специалистов:**
→ Читайте [k8s/README.md](k8s/README.md)
Там advanced tricks и troubleshooting

**Для Jenkins:**
→ Читайте [jenkins/README.md](jenkins/README.md)
CI/CD интеграция и настройка

---

## 📝 Версии

- **Kubernetes**: 1.20+
- **PostgreSQL**: 11+
- **Django**: 5.0+
- **React/Vite**: latest
- **Nginx**: latest

---

## ✅ Что включено

- [x] 12 готовых Kubernetes манифестов (проверены)
- [x] Jenkins Job DSL скрипт (готов к использованию)
- [x] Полный Jenkinsfile pipeline (16+ этапов)
- [x] Инструкция для junior администратора
- [x] Справочник всех параметров
- [x] Диаграммы архитектуры
- [x] Примеры команд
- [x] FAQ с 15+ вопросов
- [x] Troubleshooting guide
- [x] Чек-лист развертывания
- [x] Примеры для prod/staging/dev

---

## 🚀 Готово к использованию!

Все файлы находятся в:
- **K8s манифесты**: `./k8s/`
- **Jenkins конфиг**: `./jenkins/`
- **Документация**: `./docs/deployment-k8s/`

**Начните с:** [docs/deployment-k8s/JUNIOR_ADMIN_GUIDE.md](docs/deployment-k8s/JUNIOR_ADMIN_GUIDE.md)

---

**Создано:** 2024-03-20  
**Версия:** 1.0  
**Статус:** ✅ Готово к production использованию
