// Job DSL скрипт для развертывания VM Inventory в Kubernetes
// Размещается в репозитории в файле jenkins/VmInventoryDeployPipeline.groovy

pipelineJob('vm-inventory-deploy-k8s') {
    description('Развертывание VM Inventory в Kubernetes кластер с внешней БД')
    
    // Параметры сборки
    parameters {
        string(
            name: 'GIT_BRANCH',
            defaultValue: 'main',
            description: 'Git ветка для развертывания'
        )
        
        string(
            name: 'BACKEND_IMAGE_TAG',
            defaultValue: 'latest',
            description: 'Tag образа backend (например: latest, v1.0.0)'
        )
        
        string(
            name: 'FRONTEND_IMAGE_TAG',
            defaultValue: 'latest',
            description: 'Tag образа frontend (например: latest, v1.0.0)'
        )
        
        string(
            name: 'KUBERNETES_NAMESPACE',
            defaultValue: 'vm-inventory',
            description: 'Kubernetes namespace для развертывания'
        )
        
        choice(
            name: 'KUBERNETES_CLUSTER',
            choices: ['prod', 'staging', 'dev'],
            description: 'Kubernetes кластер для развертывания'
        )
        
        booleanParam(
            name: 'RUN_MIGRATIONS',
            defaultValue: true,
            description: 'Запустить миграции БД (важно при обновлении схемы)'
        )
        
        booleanParam(
            name: 'ROLLBACK_ON_FAILURE',
            defaultValue: true,
            description: 'Откатиться на предыдущую версию при неудаче'
        )
        
        string(
            name: 'DOCKER_REGISTRY',
            defaultValue: 'docker.example.com',
            description: 'Docker registry (например: docker.io, gcr.io, docker.example.com)'
        )
        
        string(
            name: 'DATABASE_HOST',
            defaultValue: 'postgres.example.com',
            description: 'Хост сервера PostgreSQL'
        )
    }
    
    // Конфигурация SCM
    definition {
        cpsScm {
            scm {
                git {
                    remote {
                        url('${GIT_REPOSITORY_URL}')
                        credentials('github-credentials')
                    }
                    branch('${GIT_BRANCH}')
                    extensions {
                        cleanBeforeCheckout()
                        cloneOption {
                            depth(1)
                            noTags(false)
                        }
                    }
                }
            }
            scriptPath('jenkins/Jenkinsfile.k8s')
        }
    }
    
    // Триггеры
    triggers {
        githubPush()  // Запуск при git push
    }
    
    // Логирование
    logRotator {
        daysToKeepStr('30')
        numToKeepStr('50')
        artifactDaysToKeepStr('7')
        artifactNumToKeepStr('10')
    }
    
    // Уведомления
    properties {
        buildDiscarder(logRotator(numToKeepStr('50'), artifactNumToKeepStr('5')))
    }
}

// Дополнительная job для проверки статуса развертывания
pipelineJob('vm-inventory-deployment-status') {
    description('Проверка статуса развертывания VM Inventory в Kubernetes')
    
    parameters {
        string(
            name: 'KUBERNETES_NAMESPACE',
            defaultValue: 'vm-inventory',
            description: 'Kubernetes namespace'
        )
        
        choice(
            name: 'KUBERNETES_CLUSTER',
            choices: ['prod', 'staging', 'dev'],
            description: 'Kubernetes кластер'
        )
    }
    
    definition {
        cps {
            script('''
@Library('shared-jenkins-lib') _

pipeline {
    agent any
    
    stages {
        stage('Check Deployment Status') {
            steps {
                sh '''
                    # Переключиться на нужный контекст
                    kubectl config use-context ${KUBERNETES_CLUSTER}
                    
                    echo "=== Статус Deployments ==="
                    kubectl -n ${KUBERNETES_NAMESPACE} get deployments -o wide
                    
                    echo "\\n=== Статус Pods ==="
                    kubectl -n ${KUBERNETES_NAMESPACE} get pods -o wide
                    
                    echo "\\n=== Статус Services ==="
                    kubectl -n ${KUBERNETES_NAMESPACE} get svc -o wide
                    
                    echo "\\n=== Статус Ingress ==="
                    kubectl -n ${KUBERNETES_NAMESPACE} get ingress -o wide
                    
                    echo "\\n=== Events ==="
                    kubectl -n ${KUBERNETES_NAMESPACE} get events --sort-by='.lastTimestamp' | tail -20
                '''
            }
        }
        
        stage('Check Backend Health') {
            steps {
                sh '''
                    # Получить IP frontend сервиса
                    FRONTEND_IP=$(kubectl -n ${KUBERNETES_NAMESPACE} get svc vm-inventory-frontend -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
                    
                    if [ "$FRONTEND_IP" != "pending" ]; then
                        echo "Frontend доступен по адресу: $FRONTEND_IP"
                        curl -I http://$FRONTEND_IP/ || echo "Frontend не отвечает"
                    else
                        echo "Frontend LoadBalancer IP еще не назначен (в статусе Pending)"
                        echo "Проверьте статус service: kubectl -n ${KUBERNETES_NAMESPACE} get svc vm-inventory-frontend"
                    fi
                '''
            }
        }
        
        stage('Check Logs') {
            steps {
                sh '''
                    echo "=== Последние логи Backend ==="
                    kubectl -n ${KUBERNETES_NAMESPACE} logs -l app=vm-inventory-backend --tail=50 --timestamps=true 2>/dev/null || echo "Логи не найдены"
                    
                    echo "\\n=== Последние логи Frontend ==="
                    kubectl -n ${KUBERNETES_NAMESPACE} logs -l app=vm-inventory-frontend --tail=50 --timestamps=true 2>/dev/null || echo "Логи не найдены"
                '''
            }
        }
    }
    
    post {
        always {
            sh '''
                echo "\\n=== Полная информация о deployments ==="
                kubectl -n ${KUBERNETES_NAMESPACE} describe deployment vm-inventory-backend 2>/dev/null | tail -50 || echo "Deployment не найден"
            '''
        }
    }
}
            ''').stripIndent()
        }
    }
}
