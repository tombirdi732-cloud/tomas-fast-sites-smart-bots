# Панель заведения и админка: статика, которую раздаёт nginx.
#
# Собирается внутри Docker, а не на сервере: на машине с 2 ГБ памяти
# ставить Node и зависимости монорепозитория негде, да и незачем.

FROM node:22-alpine AS builder
WORKDIR /app

# Только манифесты — слой с зависимостями переиспользуется между сборками.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
RUN npm ci --workspace @spasai/web --include-workspace-root --no-audit --no-fund

COPY apps/web ./apps/web
RUN npm run build --workspace @spasai/web

# ─── раздача ────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production
COPY --from=builder /app/apps/web/dist /var/www/spasai
