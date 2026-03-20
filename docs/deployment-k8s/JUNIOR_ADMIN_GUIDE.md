# Развертывание VM Inventory в Kubernetes - Инструкция для Junior Администратора

**Уровень сложности:** Средний / Для начинающих администраторов  
**Требуемые знания:** Основы Linux, Docker, понимание сетевых протоколов  
**Время выполнения:** 30-60 минут (при наличии всех предварительных условий)

---

## Содержание
1. [Предварительные требования](#предварительные-требования)
2. [Проверка окружения](#проверка-окружения)
3. [Запуск через Jenkins](#запуск-через-jenkins)
4. [Механическое развертывание (если Jenkins недоступен)](#механическое-развертывание)
5. [Проверка и диагностика](#проверка-и-диагностика)
6. [Решение проблем](#решение-проблем)
7. [Часто задаваемые вопросы](#часто-задаваемые-вопросы)

---

## Предварительные требования

Перед началом убедитесь, что у вас есть:

### 1. **Доступ к серверам**
- ✅ Доступ к Kubernetes кластеру (через `kubectl` или через Jenkins)
- ✅ Учетные данные для подключения к кластеру (kubeconfig файл)
- ✅ Доступ к серверу с PostgreSQL БД

### 2. **Программное обеспечение**

Установите на вашу рабочую машину:

```bash
# Проверить, установлены ли утилиты
which kubectl
which docker
which curl

# Если何か не установлено, установите:
# Ubuntu/Debian
sudo apt-get install -y kubectl docker.io curl

# macOS
brew install kubectl docker curl

# CentOS/RHEL
sudo yum install -y kubectl docker curl
```

### 3. **Файлы для развертывания**

Все нужные файлы находятся в репозитории в папке `k8s/`:
- Kubernetes манифесты (YAML файлы)
- Конфигурация приложения
- Инструкции по развертыванию

```bash
# Клонировать репозиторий
git clone <repository-url> vm-inventory
cd vm-inventory
```

### 4. **Параметры для подключения**

**Попросите у вашего руководителя:**

| Параметр | Пример | Описание |
|----------|--------|---------|
| **Хост Kubernetes** | `192.168.1.10` или `k8s.example.com` | IP или домен сервера Kubernetes |
| **Port Kubernetes** | `6443` | Обычно стандартный порт 6443 |
| **Хост БД** | `192.168.2.5` или `postgres.example.com` | IP или домен сервера PostgreSQL |
| **Port БД** | `5432` | Обычно стандартный порт 5432 |
| **Пользователь БД** | `vminventory` | Создается вместе с БД |
| **Пароль БД** | `secure-password` | Сгенерируется при создании БД |
| **Django SECRET_KEY** | сгенерируется | Ключ для шифрования Django |
| **Домен приложения** | `vm-inventory.example.com` | Домен, по которому будет доступно приложение |
| **URI Docker Registry** | `docker.example.com` | Где хранятся образы (если не docker.io) |

---

## Проверка окружения

### Шаг 1: Проверить kubectl

```bash
# Проверить что kubectl установлен и может подключиться к кластеру
kubectl cluster-info

# Вывод должен быть похож на:
# Kubernetes control plane is running at https://192.168.1.10:6443
# CoreDNS is running at https://192.168.1.10:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy
```

**Если ошибка подключения:**
```bash
# Убедитесь, что kubeconfig файл указан правильно
export KUBECONFIG=/path/to/kubeconfig.yaml
kubectl cluster-info

# Или проверьте права доступа:
ls -la ~/.kube/config  # Стандартное место kubeconfig
```

### Шаг 2: Проверить доступ к БД

Это **ОЧЕНЬ ВАЖНО** - если БД недоступна, развертывание будет поломано.

```bash
# Воспользуемся временным подом в кластере для проверки
kubectl run db-test --image=postgres:16-alpine --rm -it -- \
  psql -h postgres.example.com -U vminventory -d vminventory -c "SELECT 1;"

# Введите пароль (должен быть сообщен руководителем)
# Если подключение успешно:
# (1 row)
```

**Если ошибка подключения:**
- ❌ `could not translate host name "postgres.example.com" to address` → проверить имя хоста
- ❌ `Connection refused` → проверить IP/порт и firewall
- ❌ `FATAL: password authentication failed` → проверить пароль

### Шаг 3: Проверить наличие образов Docker

```bash
# Если используется локальный Docker registry
docker login docker.example.com

# Проверить наличие образов
docker pull docker.example.com/vm-inventory-backend:latest
docker pull docker.example.com/vm-inventory-frontend:latest
```

**Если образы отсутствуют:**
- Обратитесь в команду разработчиков - нужно собрать образы командой:
```bash
cd backend && docker build -t docker.example.com/vm-inventory-backend:latest .
cd frontend && docker build -t docker.example.com/vm-inventory-frontend:latest .
```

---

## Запуск через Jenkins

**Это рекомендуемый способ, так как Jenkins автоматизирует все шаги.**

### Шаг 1: Открыть Jenkins

Откройте в браузере: `http://jenkins.example.com:8080`

### Шаг 2: Найти job развертывания

1. Слева в меню нажмите **"New Item"** или найдите **"vm-inventory-deploy-k8s"**

2. Если job не существует, создайте её:
   - Нажмите **"New Item"**
   - Введите имя: `vm-inventory-deploy-k8s`
   - Выберите тип: **"Pipeline"**
   - В разделе "Pipeline" выберите: **"Pipeline script from SCM"**
   - В "SCM" выберите: **"Git"**
   - Введите URL репозитория
   - В "Script Path" укажите: `jenkins/Jenkinsfile.k8s`
   - Нажмите **"Save"**

### Шаг 3: Запустить развертывание

1. Откройте job **"vm-inventory-deploy-k8s"**

2. Нажмите кнопку **"Build with Parameters"**

3. **ВАЖНО:** Заполните параметры:

   | Параметр | Значение | Комментарий |
   |----------|----------|-----------|
   | `GIT_BRANCH` | `main` | Обычно `main` или `development` |
   | `BACKEND_IMAGE_TAG` | `latest` или `v1.0.0` | Какую версию развертываем |
   | `FRONTEND_IMAGE_TAG` | `latest` или `v1.0.0` | Должна совпадать с backend |
   | `KUBERNETES_CLUSTER` | `prod`, `staging` или `dev` | На какой кластер развертываем |
   | `KUBERNETES_NAMESPACE` | `vm-inventory` | Обычно оставить как есть |
   | `RUN_MIGRATIONS` | ✅ галочка | **ОБЯЗАТЕЛЬНО** - нужно для обновления БД |
   | `ROLLBACK_ON_FAILURE` | ✅ галочка | Откатиться при ошибке - рекомендуется |
   | `DOCKER_REGISTRY` | `docker.example.com` | Где лежат образы |
   | `DATABASE_HOST` | `postgres.example.com` | IP/домен сервера БД |

4. Нажмите **"Build"**

### Шаг 4: Следить за развертыванием

1. Откроется страница с прогрессом развертывания

2. Смотрите этапы (stages):
   - 🟢 **Зеленый** - успешно завершено
   - 🔵 **Синий** - в процессе
   - 🔴 **Красный** - ошибка

3. Нажмите на этап для просмотра логов

4. **Типичное время развертывания:** 3-10 минут

### Вывод информации при успехе

После успешного развертывания Jenkins выведет:

```
=== Информация для доступа ===
Frontend доступен по адресу:
  http://192.168.1.20:80

Backend API доступен по адресу:
  http://vm-inventory-backend:8000/api/

Статус компонентов:
Backend: 2 replicas, 2 ready
Frontend: 2 replicas, 2 ready

Для просмотра логов:
Backend:  kubectl -n vm-inventory logs -f deployment/vm-inventory-backend
Frontend: kubectl -n vm-inventory logs -f deployment/vm-inventory-frontend
```

---

## Механическое развертывание

**Если Jenkins недоступен** или из какой-то причины нужно развернуть вручную:

### Шаг 1: Подготовить конфигурационные файлы

```bash
cd k8s

# Открыть файл конфигурации
nano 02-configmap.yaml
```

Отредактируйте эти строки:

```yaml
DATABASE_HOST: "postgres.example.com"  # Адрес сервера БД
DATABASE_PORT: "5432"                   # Порт БД
DATABASE_NAME: "vminventory"            # Имя БД
DATABASE_USER: "vminventory"            # Пользователь БД
ALLOWED_HOSTS: "vm-inventory.example.com,localhost"  # Доменные имена приложения
```

### Шаг 2: Отредактировать Secret

```bash
# Открыть файл с паролями
nano 03-secret.yaml
```

Отредактируйте:

```yaml
SECRET_KEY: "generate-secure-random-key-here"  # Сгенерируйте новый ключ
DATABASE_PASSWORD: "your-db-password"          # Пароль БД
AUTH_BOOTSTRAP_USERNAME: "admin"               # Логин первого пользователя
AUTH_BOOTSTRAP_PASSWORD: "initial-password"    # Пароль первого пользователя
AUTH_BOOTSTRAP_ROLE: "admin"                   # Роль
```

**Как сгенерировать SECRET_KEY:**

```bash
# Linux
python3 -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# Или через openssl
openssl rand -base64 50
```

### Шаг 3: Переключиться на правильный Kubernetes контекст

```bash
# Посмотреть доступные контексты
kubectl config get-contexts

# Результат:
# CURRENT   NAME                    CLUSTER         AUTHINFO        NAMESPACE
#           kubernetes-prod         prod-cluster    prod-admin      
# *         kubernetes-staging      staging-cluster staging-admin   
#           kubernetes-dev          dev-cluster     dev-admin       

# Переключиться на production
kubectl config use-context kubernetes-prod
```

### Шаг 4: Применить Kubernetes манифесты

```bash
cd k8s

# ВАЖНО: Порядок имеет значение!

# 1. Создать namespace
kubectl apply -f 01-namespace.yaml
echo "✓ Namespace создан"

# 2. Применить конфигурацию (ConfigMap и Secret)
kubectl apply -f 02-configmap.yaml
kubectl apply -f 03-secret.yaml
echo "✓ Конфигурация применена"

# 3. Применить RBAC (права доступа)
kubectl apply -f 09-rbac.yaml
kubectl apply -f 10-nginx-configmap.yaml
echo "✓ RBAC и конфиг Nginx применены"

# 4. Развернуть backend (обновит образ и запустит миграции)
kubectl apply -f 04-backend-deployment.yaml
echo "✓ Backend deployment применен"

# 5. Ждем готовности backend (это занимает 1-3 минуты)
kubectl -n vm-inventory rollout status deployment/vm-inventory-backend --timeout=5m
echo "✓ Backend готов"

# 6. Развернуть frontend
kubectl apply -f 05-frontend-deployment.yaml
echo "✓ Frontend deployment применен"

# 7. Ждем готовности frontend
kubectl -n vm-inventory rollout status deployment/vm-inventory-frontend --timeout=5m
echo "✓ Frontend готов"

# 8. Создать services (точки доступа)
kubectl apply -f 06-backend-service.yaml
kubectl apply -f 07-frontend-service.yaml
kubectl apply -f 08-ingress.yaml
echo "✓ Services и Ingress созданы"

# 9. Включить автомасштабирование
kubectl apply -f 11-hpa.yaml
echo "✓ Автомасштабирование включено"

# 10. Применить политики безопасности сети
kubectl apply -f 12-network-policies.yaml
echo "✓ Network policies применены"

echo ""
echo "✅ Все манифесты успешно применены!"
```

### Шаг 5: Проверить статус

```bash
# Посмотреть все поды
kubectl -n vm-inventory get pods

# Результат должен содержать:
# NAME                                      READY   STATUS    RESTARTS   AGE
# vm-inventory-backend-6d6f7c8f99-abc12    2/2     Running   0          2m
# vm-inventory-backend-6d6f7c8f99-def34    2/2     Running   0          2m
# vm-inventory-frontend-8b5f9c4d7e-ghi56   1/1     Running   0          1m
# vm-inventory-frontend-8b5f9c4d7e-jkl78   1/1     Running   0          1m

# ✓ Если статус "Running" - всё хорошо
# ❌ Если статус "Pending", "CrashLoopBackOff" или "Error" - см. раздел "Решение проблем"
```

---

## Проверка и диагностика

### Проверка 1: Статус подов

```bash
# Полная информация обо всех подах
kubectl -n vm-inventory get pods -o wide

# Описание конкретного пода (если он не запущен)
kubectl -n vm-inventory describe pod <pod-name>

# Пример:
kubectl -n vm-inventory describe pod vm-inventory-backend-6d6f7c8f99-abc12
```

### Проверка 2: Логи приложения

```bash
# Логи backend (последние 50 строк)
kubectl -n vm-inventory logs deployment/vm-inventory-backend --tail=50

# Логи backend в реальном времени
kubectl -n vm-inventory logs deployment/vm-inventory-backend -f

# Логи frontend
kubectl -n vm-inventory logs deployment/vm-inventory-frontend --tail=50

# Логи несоответствия (если pod crashed)
kubectl -n vm-inventory logs <pod-name> --previous
```

### Проверка 3: Services и доступ

```bash
# Посмотреть IP адреса для доступа
kubectl -n vm-inventory get svc -o wide

# Результат:
# NAME                      TYPE           CLUSTER-IP      EXTERNAL-IP     PORT(S)
# vm-inventory-backend      ClusterIP      10.96.1.100     <none>          8000/TCP
# vm-inventory-frontend     LoadBalancer   10.96.1.101     192.168.1.20    80:30001/TCP,443:30002/TCP

# EXTERNAL-IP 192.168.1.20 - это адрес для доступа к приложению
```

### Проверка 4: Events (события)

```bash
# Последние события в namespace
kubectl -n vm-inventory get events --sort-by='.lastTimestamp'

# Детальное описание deployments
kubectl -n vm-inventory describe deployment vm-inventory-backend
```

### Проверка 5: Доступность приложения

```bash
# Если у вас есть LoadBalancer IP, проверить доступность
FRONTEND_IP=$(kubectl -n vm-inventory get svc vm-inventory-frontend -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Проверить доступность через curl (из внутри кластера)
kubectl -n vm-inventory run test-pod --image=curlimages/curl --rm -it -- \
  curl -v http://$FRONTEND_IP/

# Или через браузер:
# http://192.168.1.20 (замените на ваш EXTERNAL-IP)
```

---

## Решение проблем

### ❌ Проблема 1: Pod остается в статусе "Pending"

**Причины:**
- Недостаточно ресурсов на узлах Kubernetes
- Образ Docker не найден в registry
- Проблема с сетью

**Решение:**

```bash
# 1. Описание пода покажет причину
kubectl -n vm-inventory describe pod <pod-name>

# 2. Посмотреть изображения на узлах
kubectl get nodes
kubectl describe node <node-name>

# 3. Проверить доступ к Docker registry
kubectl -n vm-inventory get secrets  # Должен быть docker secret

# 4. Спроверить очереди событий
kubectl -n vm-inventory get events | grep Warning
```

### ❌ Проблема 2: Pod крашится (CrashLoopBackOff)

```bash
# Посмотреть логи ошибки
kubectl -n vm-inventory logs <pod-name>

# Описание пода
kubectl -n vm-inventory describe pod <pod-name>

# Распространенные ошибки:
# - "Connection refused" - БД недоступна
# - "Failed to bind address" - порт уже занят
# - "Out of memory" - недостаточно памяти
```

**Если проблема в БД:**

```bash
# Проверить конфиг БД
kubectl -n vm-inventory get cm vm-inventory-config -o yaml | grep DATABASE_

# Проверить доступность БД
kubectl -n vm-inventory run db-check --image=postgres:16 --rm -it -- \
  psql -h <DATABASE_HOST> -U vminventory -d vminventory -c "SELECT 1;"
```

### ❌ Проблема 3: Frontend показывает 502 Bad Gateway

**Причины:**
- Backend pod не запущен
- Backend service неправильно настроена
- Проблемы в конфигурации Nginx

**Решение:**

```bash
# 1. Проверить статус backend
kubectl -n vm-inventory get pods -l app=vm-inventory-backend

# 2. Проверить logs backend
kubectl -n vm-inventory logs deployment/vm-inventory-backend --tail=100

# 3. Проверить service
kubectl -n vm-inventory get svc vm-inventory-backend
kubectl -n vm-inventory describe svc vm-inventory-backend

# 4. Перезагрузить frontend deployment
kubectl -n vm-inventory rollout restart deployment/vm-inventory-frontend
```

### ❌ Проблема 4: Миграция БД зависла/не прошла

```bash
# Проверить логи миграции
kubectl -n vm-inventory logs <backend-pod> -c migrate

# Миграция выполняется в init контейнере, нужно ждать или:
# 1. Проверить доступность БД
# 2. Посмотреть логи на сервере БД
# 3. Перезапустить deployment

kubectl -n vm-inventory rollout restart deployment/vm-inventory-backend
```

### ❌ Проблема 5: Не могу подключиться к приложению

```bash
# 1. Проверить Service Type
kubectl -n vm-inventory get svc vm-inventory-frontend

# Если тип "LoadBalancer", должен иметь EXTERNAL-IP
# Если "NodePort", используется IP узла + высокий номер порта

# 2. Проверить Ingress (если используется)
kubectl -n vm-inventory get ingress
kubectl -n vm-inventory describe ingress vm-inventory-ingress

# 3. Проверить доступность через port-forward
kubectl -n vm-inventory port-forward svc/vm-inventory-frontend 8080:80

# Затем откройте: http://localhost:8080
```

---

## Часто задаваемые вопросы

### Q: Как проверить логи для отладки?

```bash
# Live логи backend
kubectl -n vm-inventory logs -f deployment/vm-inventory-backend

# Логи frontend
kubectl -n vm-inventory logs -f deployment/vm-inventory-frontend

# Все логи сразу за последний час
kubectl -n vm-inventory logs deployment/vm-inventory-backend --since=1h

# С меткой времени
kubectl -n vm-inventory logs deployment/vm-inventory-backend --timestamps=true
```

### Q: Как перезагрузить приложение?

```bash
# Перезагрузить весь deployment
kubectl -n vm-inventory rollout restart deployment/vm-inventory-backend
kubectl -n vm-inventory rollout restart deployment/vm-inventory-frontend

# Ждать готовности
kubectl -n vm-inventory rollout status deployment/vm-inventory-backend --timeout=5m
```

### Q: Как откатить развертывание на предыдущую версию?

```bash
# Посмотреть историю
kubectl -n vm-inventory rollout history deployment/vm-inventory-backend

# Откатить на предыдущую версию
kubectl -n vm-inventory rollout undo deployment/vm-inventory-backend

# Откатить на конкретную версию (например, version 3)
kubectl -n vm-inventory rollout undo deployment/vm-inventory-backend --to-revision=3

# Ждать завершения
kubectl -n vm-inventory rollout status deployment/vm-inventory-backend --timeout=5m
```

### Q: Как измениться пароль базы данных?

**ВАЖНО:** Нужны права администратора на сервер БД!

```bash
# 1. Изменить пароль в БД
psql -h postgres.example.com -U vminventory -d vminventory
> ALTER USER vminventory WITH PASSWORD 'new-password';
> \q

# 2. Обновить Secret в Kubernetes
kubectl -n vm-inventory edit secret vm-inventory-secret

# 3. Перезагрузить deployment чтобы подхватил новый пароль
kubectl -n vm-inventory rollout restart deployment/vm-inventory-backend

# 4. Следить за перезагрузкой
kubectl -n vm-inventory rollout status deployment/vm-inventory-backend
```

### Q: Как добавить еще одну реплику (масштабировать)?

```bash
# Вручную
kubectl -n vm-inventory scale deployment vm-inventory-backend --replicas=4

# Проверить
kubectl -n vm-inventory get pods -l app=vm-inventory-backend
```

**Примечание:** Если HPA (автомасштабирование) включено, оно может переопределить ваше значение!

### Q: Как просмотреть детали Ingress и узнать URL для доступа?

```bash
# Информация об Ingress
kubectl -n vm-inventory get ingress -o wide

# Описание Ingress (включает IP адрес)
kubectl -n vm-inventory describe ingress vm-inventory-ingress

# Прямой URL будет вроде:
# http://192.168.1.20/  или
# http://vm-inventory.example.com/  (если настроен DNS)
```

### Q: Как обновить конфигурацию (ConfigMap)?

```bash
# Открыть редактор
kubectl -n vm-inventory edit configmap vm-inventory-config

# Сохранить (Ctrl+O, Enter, Ctrl+X в nano)

# Перезагрузить deployment чтобы подхватил новую конфиг
kubectl -n vm-inventory rollout restart deployment/vm-inventory-backend
kubectl -n vm-inventory rollout restart deployment/vm-inventory-frontend
```

### Q: Как удалить всё и начать заново?

```bash
# ⚠️ ОСТОРОЖНО: Это удалит ВСЕ данные в локальной БД!
# Если используется внешняя БД - данные останутся

kubectl delete namespace vm-inventory

# Затем можно заново применить манифесты
kubectl apply -f k8s/
```

### Q: Как увеличить лимиты памяти/CPU?

```bash
# Открыть deployment
kubectl -n vm-inventory edit deployment vm-inventory-backend

# Найти секцию resources и изменить:
# resources:
#   requests:
#     memory: "512Mi"
#     cpu: "250m"
#   limits:
#     memory: "2Gi"  # <-- увеличить
#     cpu: "1000m"   # <-- увеличить

# Сохранить и exit
# Deployment автоматически перезагрузится
```

### Q: Как просмотреть метрики использования ресурсов?

```bash
# Нужен установленный Metrics Server в кластере!

# Использование по podам
kubectl -n vm-inventory top pods

# Использование по узлам
kubectl -n vm-inventory top nodes

# Детально для пода
kubectl -n vm-inventory describe pod <pod-name> | grep -A 10 "Requests"
```

### Q: Как отправить команду внутрь пода для отладки?

```bash
# Интерактивный shell в поде
kubectl -n vm-inventory exec -it <pod-name> -- /bin/bash

# Или для Alpine (более легкий образ):
kubectl -n vm-inventory exec -it <pod-name> -- /bin/sh

# Выполнить одну команду
kubectl -n vm-inventory exec <pod-name> -- ls -la /app

# Пример отладки backend
kubectl -n vm-inventory exec -it <backend-pod> -- \
  python manage.py shell

# Пример проверки БД из пода
kubectl -n vm-inventory exec -it <backend-pod> -- \
  python -c "import os; print(os.environ.get('DATABASE_URL'))"
```

---

## Контрольный список развертывания

Используйте этот чек-лист для проверки успешного развертывания:

- [ ] Получены все параметры у руководителя
- [ ] Проверено подключение к Kubernetes кластеру (`kubectl cluster-info`)
- [ ] Проверено подключение к PostgreSQL БД
- [ ] Все Docker образы доступны в registry
- [ ] Отредактированы ConfigMap (02-configmap.yaml) с правильными параметрами
- [ ] Отредактирован Secret (03-secret.yaml) с новыми паролями
- [ ] Запущено развертывание через Jenkins или вручную
- [ ] Все поды в статусе "Running" (`kubectl get pods`)
- [ ] Проверены логи - нет красных строк об ошибках
- [ ] Backend доступен через Service (`kubectl get svc`)
- [ ] Frontend доступен по IP адресу/домену
- [ ] Можно залогиниться в приложение (admin/password)
- [ ] Данные сохраняются корректно
- [ ] Настроено резервное копирование БД
- ✅ Развертывание завершено

---

## Горячие клавиши и сокращения

```bash
# Часто используемые команды с сокращениями
alias kns='kubectl config set-context --current --namespace'  # Переключать namespace
kns vm-inventory  # Установить ns по умолчанию

# потом можно писать просто:
kubectl get pods  # вместо kubectl -n vm-inventory get pods

# Другие сокращения
alias k=kubectl
alias kg='kubectl get'
alias kd='kubectl describe'
alias kl='kubectl logs'
alias ke='kubectl exec -it'
```

Добавьте в файл `~/.bashrc` или `~/.zshrc`:
```bash
source <(kubectl completion bash)  # Auto-completion для kubectl
```

---

## Где получить помощь

### Уровень 1: Документация
- Читайте логи ошибок первое
- Проверьте раздел "Решение проблем" выше
- Посмотрите документацию в `docs/` папке репозитория

### Уровень 2: Команда DevOps
- Напишите в Slack канал #devops
- Email: devops@example.com
- Telegram: в корпоративную группу

### Уровень 3: Комjнда разработки
- Если проблема в приложении (логика, функции)
- GitHub Issues в репозитории
- Встреча с tech lead

### Уровень 4: Поддержка Kubernetes
- Kubernetes документация: https://kubernetes.io/docs/
- Slack сообщество: https://kubernetes.slack.com/

---

## Безопасность

⚠️ **ВАЖНО ПОМНИТЬ:**

1. **Никогда** не коммитьте пароли и SECRET_KEY в Git!
2. Используйте **Secret** в Kubernetes для всех конфиденциальных данных
3. Ограничивайте доступ к kubeconfig файлам (chmod 600)
4. Не распространяйте пароли БД по открытым каналам
5. Регулярно меняйте пароли (каждые 90 дней)
6. Логируйте все действия и проверяйте логи на аномалии

---

**Успехов! 🚀**

При возникновении вопросов обратитесь к вашему руководителю или в команду DevOps.
