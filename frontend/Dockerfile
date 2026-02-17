FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
# Build and keep container running so nginx can depend on it
CMD ["sh", "-c", "npm run build && tail -f /dev/null"]
