#!/bin/bash
# Быстрый старт развертывания VM Inventory в Kubernetes
# Этот скрипт помогает быстро развернуть приложение

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║     VM Inventory Kubernetes Quick Start Deployment            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}✗ $1 не установлен${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ $1 найден${NC}"
    return 0
}

# Проверка требуемых инструментов
echo -e "${BLUE}1️⃣  Проверка требуемых инструментов...${NC}"
echo ""
check_command "kubectl" || { echo "Установите kubectl"; exit 1; }
check_command "curl" || { echo "Установите curl"; exit 1; }
echo ""

# Проверка доступа к кластеру
echo -e "${BLUE}2️⃣  Проверка доступа к Kubernetes кластеру...${NC}"
echo ""
if kubectl cluster-info &> /dev/null; then
    echo -e "${GREEN}✓ Подключение к кластеру OK${NC}"
    kubectl cluster-info | head -n 1
else
    echo -e "${RED}✗ Не может подключиться к Kubernetes кластеру${NC}"
    echo "Убедитесь, что:"
    echo "  1. Kubernetes кластер запущен"
    echo "  2. Файл kubeconfig правильно настроен"
    echo "  3. Команда 'kubectl cluster-info' работает"
    exit 1
fi
echo ""

# Выбор окружения
echo -e "${BLUE}3️⃣  Выбор окружения для развертывания${NC}"
echo ""
echo "Доступные контексты:"
kubectl config get-contexts --no-headers | awk '{print "  " NR ". " $1 " (" $3 ")"}'
echo ""
read -p "Введите номер контекста (или Enter для текущего): " context_choice

if [ ! -z "$context_choice" ]; then
    context=$(kubectl config get-contexts --no-headers | awk 'NR=='$context_choice' {print $1}')
    if [ -z "$context" ]; then
        echo -e "${RED}✗ Неверный выбор${NC}"
        exit 1
    fi
    kubectl config use-context $context
    echo -e "${GREEN}✓ Переключено на контекст: $context${NC}"
else
    context=$(kubectl config current-context)
    echo -e "${GREEN}✓ Используется текущий контекст: $context${NC}"
fi
echo ""

# Параметры развертывания
echo -e "${BLUE}4️⃣  Ввод параметров развертывания${NC}"
echo ""
read -p "Хост PostgreSQL (postgres.example.com): " db_host
db_host=${db_host:-postgres.example.com}

read -p "Порт PostgreSQL (5432): " db_port
db_port=${db_port:-5432}

read -p "Пользователь БД (vminventory): " db_user
db_user=${db_user:-vminventory}

read -sp "Пароль БД: " db_password
echo ""

read -p "Docker Registry (docker.example.com): " docker_registry
docker_registry=${docker_registry:-docker.example.com}

read -p "Backend image tag (latest): " backend_tag
backend_tag=${backend_tag:-latest}

read -p "Frontend image tag (latest): " frontend_tag
frontend_tag=${frontend_tag:-latest}

echo ""
echo -e "${BLUE}5️⃣  Проверка параметров${NC}"
echo ""
echo "Параметры развертывания:"
echo "  Контекст: $context"
echo "  БД хост: $db_host"
echo "  БД порт: $db_port"
echo "  БД пользователь: $db_user"
echo "  Docker Registry: $docker_registry"
echo "  Backend tag: $backend_tag"
echo "  Frontend tag: $frontend_tag"
echo ""

read -p "Продолжить с этими параметрами? (y/n): " confirm
if [ "$confirm" != "y" ]; then
    echo "Отмена"
    exit 0
fi
echo ""

# Проверка доступности БД
echo -e "${BLUE}6️⃣  Проверка доступности PostgreSQL...${NC}"
echo ""
echo "Проверка подключения к БД..."
if kubectl run pg-test --image=postgres:16-alpine --rm -i --restart=Never -- \
    psql -h $db_host -p $db_port -U $db_user -d vminventory -c "SELECT 1;" \
    --password=$db_password 2>/dev/null; then
    echo -e "${GREEN}✓ Подключение к БД успешно${NC}"
else
    echo -e "${YELLOW}⚠ Не удалось подключиться к БД${NC}"
    echo "Проверьте:"
    echo "  1. Доступность сервера БД по адресу $db_host:$db_port"
    echo "  2. Правильность пароля"
    echo "  3. Правильность имени пользователя"
    read -p "Продолжить несмотря на это? (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        exit 0
    fi
fi
echo ""

# Развертывание
echo -e "${BLUE}7️⃣  Развертывание манифестов${NC}"
echo ""

# Проверить наличие папки k8s
if [ ! -d "k8s" ]; then
    echo -e "${RED}✗ Папка k8s не найдена в текущей директории${NC}"
    echo "Убедитесь, что вы находитесь в папке vm-inventory"
    exit 1
fi

# Создать временную папку для обработанных манифестов
mkdir -p k8s_deploy

# Заменить переменные в манифестах
for file in k8s/*.yaml; do
    echo "  Обработка $(basename $file)..."
    envsubst < "$file" > "k8s_deploy/$(basename $file)" 2>/dev/null || cp "$file" "k8s_deploy/$(basename $file)"
done

# Применить манифесты в правильном порядке
echo ""
echo -e "${YELLOW}Применение Kubernetes манифестов...${NC}"
echo ""

# 1. Namespace
kubectl apply -f k8s_deploy/01-namespace.yaml
echo -e "${GREEN}✓ Namespace создан${NC}"

# 2. ConfigMap и Secret
kubectl apply -f k8s_deploy/02-configmap.yaml
# Обновить значения базы данных в ConfigMap
kubectl -n vm-inventory patch configmap vm-inventory-config -p "{\"data\":{\"DATABASE_HOST\":\"$db_host\",\"DATABASE_PORT\":\"$db_port\",\"DATABASE_USER\":\"$db_user\"}}" 2>/dev/null || true

kubectl apply -f k8s_deploy/03-secret.yaml
# Обновить пароль БД в Secret
kubectl -n vm-inventory patch secret vm-inventory-secret -p "{\"data\":{\"DATABASE_PASSWORD\":\"$(echo -n $db_password | base64 -w0)\"}}" 2>/dev/null || true

echo -e "${GREEN}✓ ConfigMap и Secret применены${NC}"

# 3. RBAC
kubectl apply -f k8s_deploy/09-rbac.yaml
kubectl apply -f k8s_deploy/10-nginx-configmap.yaml
echo -e "${GREEN}✓ RBAC и конфиг Nginx применены${NC}"

# 4. Backend Deployment
kubectl apply -f k8s_deploy/04-backend-deployment.yaml
echo -e "${GREEN}✓ Backend deployment применен${NC}"
echo "  Ожидание готовности backend (это может занять 1-3 минуты)..."
kubectl -n vm-inventory rollout status deployment/vm-inventory-backend --timeout=5m || {
    echo -e "${YELLOW}⚠ Backend не готов, но продолжаем...${NC}"
}
echo ""

# 5. Frontend Deployment
kubectl apply -f k8s_deploy/05-frontend-deployment.yaml
echo -e "${GREEN}✓ Frontend deployment применен${NC}"
echo "  Ожидание готовности frontend..."
kubectl -n vm-inventory rollout status deployment/vm-inventory-frontend --timeout=5m || {
    echo -e "${YELLOW}⚠ Frontend не готов, но продолжаем...${NC}"
}
echo ""

# 6. Services и Ingress
kubectl apply -f k8s_deploy/06-backend-service.yaml
kubectl apply -f k8s_deploy/07-frontend-service.yaml
kubectl apply -f k8s_deploy/08-ingress.yaml
echo -e "${GREEN}✓ Services и Ingress применены${NC}"

# 7. HPA
kubectl apply -f k8s_deploy/11-hpa.yaml
echo -e "${GREEN}✓ Автомасштабирование включено${NC}"

# 8. Network Policies
kubectl apply -f k8s_deploy/12-network-policies.yaml
echo -e "${GREEN}✓ Network policies применены${NC}"

echo ""
echo -e "${BLUE}8️⃣  Проверка статуса развертывания${NC}"
echo ""

echo "Статус podов:"
kubectl -n vm-inventory get pods -o wide

echo ""
echo "Статус services:"
kubectl -n vm-inventory get svc -o wide

echo ""
echo -e "${BLUE}9️⃣  Информация для доступа${NC}"
echo ""

FRONTEND_IP=$(kubectl -n vm-inventory get svc vm-inventory-frontend -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
if [ -z "$FRONTEND_IP" ]; then
    FRONTEND_IP="<pending>"
fi

echo "Frontend доступен по адресу:"
echo "  http://$FRONTEND_IP/"
echo ""

echo "Для просмотра логов:"
echo "  kubectl -n vm-inventory logs -f deployment/vm-inventory-backend"
echo "  kubectl -n vm-inventory logs -f deployment/vm-inventory-frontend"
echo ""

echo -e "${YELLOW}Рекомендуемые действия:${NC}"
echo "  1. Дождитесь, пока все поды перейдут в статус 'Running'"
echo "  2. Проверьте логи на наличие ошибок"
echo "  3. Откройте приложение в браузере"
echo "  4. Залогиньтесь с учетными данными bootstrap (см. Secret)"
echo ""

# Очистка временной папки
rm -rf k8s_deploy

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✓ Развертывание завершено!                               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Команды для дальнейшей работы:"
echo "  kubectl -n vm-inventory get all              # Просмотр всех ресурсов"
echo "  kubectl -n vm-inventory get pods             # Статус подов"
echo "  kubectl -n vm-inventory logs -f <pod-name>   # Логи пода"
echo "  kubectl -n vm-inventory describe pod <name>  # Описание пода"
echo ""
