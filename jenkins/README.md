# Job DSL для Jenkins - VM Inventory Kubernetes Deployment

Этот файл содержит Job DSL скрипты для настройки pipeline в Jenkins для развертывания VM Inventory в Kubernetes с внешним сервером БД.

## Структура

| Файл | Описание |
|------|---------|
| `VmInventoryDeployPipeline.groovy` | Job DSL скрипт для создания pipeline job |
| `Jenkinsfile.k8s` | Declarative Pipeline скрипт (основной workflow) |
| `README.md` | Документация |

## Установка и настройка

### 1. Создание и настройка Job в Jenkins

#### Способ 1: Через Job DSL Plugin

1. Создайте новую job в Jenkins типа "Job DSL"
2. В разделе "Groovy" выберите "Use Groovy Sandbox"
3. Скопируйте содержимое `VmInventoryDeployPipeline.groovy` в текстовое поле
4. Измените значения по умолчанию:
   - `GIT_REPOSITORY_URL` - URL вашего Git репозитория
   - `DEFAULT_RECIPIENTS` - Email для уведомлений
5. Нажмите "Build" для создания jobs

Или выполните через Job DSL:

```groovy
@Library('shared-jenkins-lib') _

jobDsl {
    factory {
        filingName 'jenkins/VmInventoryDeployPipeline.groovy'
        removeAction 'DISABLE'
        lookupStrategy 'SEED_JOB'
    }
}
```

#### Способ 2: Через Pipeline Job с Git SCM

1. Создайте новую job типа "Pipeline"
2. В разделе "Pipeline" выберите "Pipeline script from SCM"
3. Выберите "Git" как SCM
4. Введите URL репозитория
5. В "Script Path" укажите `jenkins/Jenkinsfile.k8s`
6. Нажмите "Save"

### 2. Настройка учетных данных Jenkins

Добавьте następующие credentials в Jenkins:

```bash
# Идентификатор: github-credentials
# Тип: Username with password или SSH Key
# Описание: GitHub credentials для клонирования репозитория

# Идентификатор: kubernetes-prod-kubeconfig
# Тип: Secret file
# Описание: Kubeconfig для production кластера

# Идентификатор: kubernetes-staging-kubeconfig
# Тип: Secret file
# Описание: Kubeconfig для staging кластера

# Идентификатор: kubernetes-dev-kubeconfig
# Тип: Secret file
# Описание: Kubeconfig для dev кластера

# Идентификатор: docker-registry-credentials
# Тип: Username with password
# Описание: Учетные данные для Docker registry
```

### 3. Настройка переменных окружения Jenkins

В конфигурации Jenkins (Manage Jenkins → Configure System) установите:

```
# Kubernetes контексты (для каждого контекста свой)
KUBERNETES_PROD_CONTEXT = kubernetes-prod
KUBERNETES_STAGING_CONTEXT = kubernetes-staging
KUBERNETES_DEV_CONTEXT = kubernetes-dev

# Docker Registry
DOCKER_REGISTRY = docker.example.com

# Git Repository
GIT_REPOSITORY_URL = https://github.com/yourorg/vm-inventory.git

# Email для уведомлений
DEFAULT_RECIPIENTS = devops@example.com
```

### 4. Конфигурация Kubeconfig

Для каждого кластера (prod, staging, dev) убедитесь, что контексты в kubeconfig файлах правильно названы:

```bash
# Проверить текущие контексты
kubectl config get-contexts

# Если контексты названы по-другому, переименуйте их
kubectl config rename-context old-name kubernetes-prod
```

## Использование

### Запуск deploy pipeline

1. Откройте job `vm-inventory-deploy-k8s` в Jenkins
2. Нажмите "Build with Parameters"
3. Установите параметры:
   - **GIT_BRANCH**: ветка для развертывания (по умолчанию `main`)
   - **BACKEND_IMAGE_TAG**: версия backend образа (например `v1.0.0` или `latest`)
   - **FRONTEND_IMAGE_TAG**: версия frontend образа
   - **KUBERNETES_CLUSTER**: целевой кластер (`prod`, `staging`, `dev`)
   - **KUBERNETES_NAMESPACE**: namespace в кластере (по умолчанию `vm-inventory`)
   - **RUN_MIGRATIONS**: запустить миграции БД (обычно `true`)
   - **ROLLBACK_ON_FAILURE**: откатиться при неудаче (обычно `true`)
4. Нажмите "Build"

### Проверка статуса развертывания

Job `vm-inventory-deployment-status` позволяет проверить текущий статус:

1. Откройте job `vm-inventory-deployment-status`
2. Нажмите "Build with Parameters"
3. Выберите нужный кластер и namespace
4. Нажмите "Build"

Эта job выполнит:
- Проверку статуса deployments и pods
- Проверку services и ingress
- Вывод последних событий
- Проверку доступности приложения

## Этапы Pipeline

### Stage: Подготовка
- Клонирование репозитория
- Вывод параметров развертывания

### Stage: Проверка окружения
- Проверка версии kubectl, docker
- Проверка текущего контекста Kubernetes

### Stage: Переключение контекста
- Переключение на нужный Kubernetes кластер
- Валидация наличия контекста

### Stage: Подготовка манифестов
- Замена переменных окружения в Kubernetes YAML файлах
- Создание обработанных манифестов

### Stage: Валидация манифестов
- Синтаксическая проверка YAML
- Dry-run проверка (без применения)

### Stage: Создание Namespace и Secrets
- Создание namespace `vm-inventory`
- Применение ConfigMap и Secret с конфиденциальными данными

### Stage: Проверка подключения к БД
- Проверка доступности PostgreSQL сервера из кластера
- Тестовое подключение к БД

### Stage: Развертывание Backend
- Обновление deployment для Django backend
- Выполнение миграций БД (через init контейнер)
- Ожидание readiness проб

### Stage: Развертывание Frontend
- Обновление deployment для React frontend
- Ожидание readiness проб

### Stage: Применение Services и Ingress
- Создание ClusterIP service для backend
- Создание LoadBalancer service для frontend
- Создание Ingress для маршрутизации

### Stage: Smoke Tests
- Проверка доступности API endpoints
- Базовые тесты функциональности

### Stage: Вывод информации
- IP адреса для доступа к приложению
- Команды для просмотра логов

## Откат развертывания

При ошибках pipeline автоматически откатывается на предыдущую версию (если `ROLLBACK_ON_FAILURE = true`):

```bash
kubectl -n vm-inventory rollout undo deployment/vm-inventory-backend
kubectl -n vm-inventory rollout undo deployment/vm-inventory-frontend
```

Можно сделать вручную:

```bash
# Просмотреть историю
kubectl -n vm-inventory rollout history deployment/vm-inventory-backend

# Откатиться на конкретную версию
kubectl -n vm-inventory rollout undo deployment/vm-inventory-backend --to-revision=2
```

## Troubleshooting

### Pipeline зависает при миграциях БД

```bash
# Проверить логи init контейнера
kubectl -n vm-inventory logs <backend-pod> -c migrate

# Проверить доступность БД
kubectl -n vm-inventory exec <backend-pod> -- \
  nc -zv postgres.example.com 5432
```

### Backend не соединяется с БД

1. Проверить правильность параметров БД в ConfigMap:
```bash
kubectl -n vm-inventory get cm vm-inventory-config -o yaml | grep DATABASE
```

2. Проверить доступность из пода:
```bash
kubectl -n vm-inventory run psql --image=postgres:16 --rm -it \
  -- psql -h postgres.example.com -U vminventory -d vminventory
```

### Frontend/Backend не стартуют

```bash
# Описание пода (показывает ошибки)
kubectl -n vm-inventory describe pod <pod-name>

# Логи пода
kubectl -n vm-inventory logs <pod-name> --previous  # если pod crashed
```

### Ingress не работает

```bash
# Проверить Ingress
kubectl -n vm-inventory get ingress -o wide

# Описание Ingress
kubectl -n vm-inventory describe ingress vm-inventory-ingress

# Проверить контроллер Ingress
kubectl -n ingress-nginx get pods
```

## Интеграция с CI/CD

### GitLab CI
```yaml
deploy:k8s:
  stage: deploy
  script:
    - curl -X POST http://jenkins:8080/job/vm-inventory-deploy-k8s/buildWithParameters \
        --user admin:${JENKINS_API_TOKEN} \
        -F BACKEND_IMAGE_TAG=${CI_COMMIT_SHA:0:8} \
        -F KUBERNETES_CLUSTER=staging
```

### GitHub Actions
```yaml
- name: Trigger Jenkins Deploy
  run: |
    curl -X POST http://jenkins:8080/job/vm-inventory-deploy-k8s/buildWithParameters \
      --user admin:${{ secrets.JENKINS_API_TOKEN }} \
      -F BACKEND_IMAGE_TAG=${{ github.sha }} \
      -F KUBERNETES_CLUSTER=staging
```

## Мониторинг развертывания

### Prometheus metrics
Backend pod помечен для сбора метрик:
```yaml
prometheus.io/scrape: "true"
prometheus.io/port: "8000"
```

### Логирование
Все логи собираются из stdout контейнеров. Для интеграции с ELK/Loki используйте Fluent Bit или Logstash.

### Alerts
Рекомендуется настроить алерты для:
- Pod CrashLoopBackOff
- High CPU/Memory usage
- Database connection failures
- Deployment replicas not ready

## Опасные операции

⚠️ **ОСТОРОЖНО:** следующие операции могут привести к потере данных:

```bash
# Удалить весь namespace (удалит все данные в БД если она локальная)
kubectl delete namespace vm-inventory

# Пересоздать secret (старый secret будет потерян)
kubectl delete secret vm-inventory-secret -n vm-inventory
```

## Полезные команды

```bash
# Переключить контекст
kubectl config use-context kubernetes-prod

# Просмотреть все resources
kubectl -n vm-inventory get all

# Посмотреть events
kubectl -n vm-inventory get events

# Очистить завершенные поды
kubectl -n vm-inventory delete pods --field-selector=status.phase=Failed

# Масштабирование
kubectl -n vm-inventory scale deployment vm-inventory-backend --replicas=5

# Выполнить команду в поде
kubectl -n vm-inventory exec -it <pod> -- bash
```

## Интеграция с Slack

Добавьте в Jenkinsfile:

```groovy
post {
    failure {
        slackSend(
            color: 'danger',
            message: "VM Inventory deploy FAILED\nCluster: ${KUBERNETES_CLUSTER}"
        )
    }
    success {
        slackSend(
            color: 'good',
            message: "VM Inventory deploy SUCCESS\nCluster: ${KUBERNETES_CLUSTER}"
        )
    }
}
```

## Лицензирования и права

- Требуется доступ к Kubernetes кластеру с правами на управление deployments/pods/services
- Требуется доступ к Docker registry для push/pull образов
- Требуется доступ к Git репозиторию
- Требуется доступ к PostgreSQL сервер для миграций

## Контроль версий

Сохраняйте версии в git commits:
```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

Затем при развертываниииспользуйте та же версия для backend и frontend.
