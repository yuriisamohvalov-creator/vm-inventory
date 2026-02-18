FROM node:18-alpine as builder

WORKDIR /app

# Копируем package.json
COPY package*.json ./

# Устанавливаем зависимости (используем install вместо ci)
RUN npm install

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

# Финальный образ для статики
FROM nginx:alpine

# Копируем собранные файлы из builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Копируем конфигурацию nginx для SPA
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]