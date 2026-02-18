FROM python:3.12-slim

WORKDIR /app

# Устанавливаем системные зависимости для WeasyPrint и других библиотек
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Копируем requirements и устанавливаем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код приложения
COPY . .

# Собираем статические файлы
RUN python manage.py collectstatic --noinput

# Запускаем приложение
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "vm_inventory.wsgi:application"]