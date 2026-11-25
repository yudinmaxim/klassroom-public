# syntax=docker/dockerfile:1

# --- сборка ---
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json nuxt.config.ts ./
# postinstall (nuxt prepare) требует исходники — отключаем, prepare сделает build
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# --- runtime ---
FROM node:22-slim
# git нужен git-журналу контента (specs/03); ca-certificates — для исходящих HTTPS
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NITRO_PORT=3000 \
    HOST=0.0.0.0
COPY --from=build /app/.output ./.output
COPY package.json ./

# Данные монтируются volume'ами (см. docker-compose.yml):
#   /app/content  — wiki-контент, отдельный git-репозиторий
#   /app/users    — аккаунты
#   /app/sessions — сессии
#   /app/roles    — переопределения ролей
#   /app/qr-tokens— одноразовые QR-токены
VOLUME ["/app/content", "/app/users", "/app/sessions", "/app/roles", "/app/qr-tokens"]

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
