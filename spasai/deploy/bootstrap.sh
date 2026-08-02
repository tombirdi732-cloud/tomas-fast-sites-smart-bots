#!/usr/bin/env bash
#
# Разворачивает «Спасай» на чистом Ubuntu 24.04 с нуля.
#
#   bash bootstrap.sh spasai.ru you@example.com
#
# Первый аргумент — домен, второй — почта для Let's Encrypt.
# Скрипт можно запускать повторно: он пропускает уже сделанное.
#
# Репозиторий приватный, поэтому нужен токен GitHub с правом чтения:
#   export SPASAI_TOKEN=github_pat_...
# Без него скрипт объяснит, что делать, и остановится.

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
REPO="${SPASAI_REPO:-https://github.com/tombirdi732-cloud/tomas-fast-sites-smart-bots.git}"
BRANCH="${SPASAI_BRANCH:-claude/hello-create-hpsvnj}"
TOKEN="${SPASAI_TOKEN:-}"
ROOT=/opt/spasai

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Использование: bootstrap.sh <домен> <почта-для-сертификата>" >&2
  echo "Например:      bootstrap.sh spasai.ru me@mail.ru" >&2
  exit 1
fi

say() { printf '\n\033[32m▸ %s\033[0m\n' "$1"; }

# Домен мог приехать из мессенджера с длинным тире вместо «--» —
# тогда первым аргументом окажется мусор, а не адрес.
if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$ ]]; then
  echo "«$DOMAIN» не похоже на домен." >&2
  echo "Проверьте, что в команде именно два дефиса (--), а не длинное тире." >&2
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "Запустите от root: sudo bash bootstrap.sh $DOMAIN $EMAIL" >&2
  exit 1
fi

# ─── 1. Домен должен уже указывать на этот сервер ───────────────────────────
say "Проверяем домен $DOMAIN"
apt-get update -qq && apt-get install -y -qq dnsutils curl git >/dev/null

SERVER_IP=$(curl -fsS https://api.ipify.org || echo '')
DOMAIN_IP=$(dig +short "$DOMAIN" A | tail -1)

if [[ -z "$DOMAIN_IP" ]]; then
  echo "У домена $DOMAIN нет A-записи. Заведите её на IP $SERVER_IP и подождите." >&2
  exit 1
fi
if [[ -n "$SERVER_IP" && "$DOMAIN_IP" != "$SERVER_IP" ]]; then
  echo "Домен $DOMAIN ведёт на $DOMAIN_IP, а сервер имеет IP $SERVER_IP." >&2
  echo "Поправьте A-запись и запустите скрипт заново — иначе сертификат не выдадут." >&2
  exit 1
fi
echo "Домен указывает сюда."

# ─── 2. Swap: на 2 ГБ памяти без него сборка не переживёт ───────────────────
if ! swapon --show | grep -q /swapfile; then
  say "Добавляем swap 2 ГБ"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -qw vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi

# ─── 3. Docker ──────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null; then
  say "Ставим Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi

# ─── 4. Файрвол: наружу только SSH и веб ────────────────────────────────────
say "Настраиваем файрвол"
apt-get install -y -qq ufw >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

# ─── 5. Код ─────────────────────────────────────────────────────────────────
# Репозиторий приватный: без токена git до него не достучится.
if [[ -n "$TOKEN" ]]; then
  # Токен кладём в файл для root, а не в URL репозитория: иначе он осел бы
  # в .git/config и светился в выводе любой команды git remote.
  git config --global credential.helper store
  printf 'https://x-access-token:%s@github.com\n' "$TOKEN" > /root/.git-credentials
  chmod 600 /root/.git-credentials
fi

if [[ -d "$ROOT/.git" ]]; then
  say "Обновляем код"
  git -C "$ROOT" fetch origin "$BRANCH" --quiet
  git -C "$ROOT" checkout -q "$BRANCH"
  git -C "$ROOT" reset --hard "origin/$BRANCH" --quiet
else
  say "Забираем код"
  if ! git clone --branch "$BRANCH" --depth 1 "$REPO" "$ROOT" --quiet 2>/dev/null; then
    echo >&2
    echo "Не удалось скачать код из $REPO" >&2
    echo >&2
    echo "Репозиторий приватный — нужен токен GitHub с правом чтения:" >&2
    echo "  1. https://github.com/settings/personal-access-tokens/new" >&2
    echo "  2. Repository access → Only select repositories → выберите этот репозиторий" >&2
    echo "  3. Permissions → Repository permissions → Contents: Read-only" >&2
    echo "  4. Запустите скрипт так:" >&2
    echo "     export SPASAI_TOKEN=github_pat_ваш_токен" >&2
    echo "     bash bootstrap.sh $DOMAIN $EMAIL" >&2
    exit 1
  fi
fi

cd "$ROOT/spasai"

# ─── 6. Секреты ─────────────────────────────────────────────────────────────
if [[ ! -f deploy/.env ]]; then
  say "Генерируем секреты"
  cp deploy/.env.example deploy/.env

  set_env() {
    if grep -q "^$1=" deploy/.env; then
      sed -i "s|^$1=.*|$1=$2|" deploy/.env
    else
      echo "$1=$2" >> deploy/.env
    fi
  }

  set_env DOMAIN "$DOMAIN"
  set_env POSTGRES_USER spasai
  set_env POSTGRES_DB spasai
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
  set_env REDIS_PASSWORD "$(openssl rand -hex 24)"
  set_env JWT_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
  set_env AUTH_HASH_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
  # Пока не подключены SMS и эквайринг: бронь без предоплаты, оплата на кассе,
  # вход в приложение — через демо-кнопку. Оба флага снимаются позже.
  set_env PAYMENTS_MODE on_pickup
  set_env DEMO_LOGIN true
  # Провайдер SMS нужен уже на старте: боевой режим не пускает заглушку.
  set_env SMS_PROVIDER smsru
  chmod 600 deploy/.env
  echo "Секреты в $ROOT/spasai/deploy/.env — оттуда же заполняются ключи SMS."
fi

COMPOSE="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env"

# ─── 7. Сертификат ──────────────────────────────────────────────────────────
have_cert() {
  $COMPOSE run --rm --entrypoint sh certbot \
    -c "test -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem" 2>/dev/null
}

if ! have_cert; then
  say "Выпускаем сертификат Let's Encrypt"

  # Пока сертификата нет, nginx поднимается с временным конфигом только
  # на 80 порту — иначе он не стартует и проверку домена проходить нечему.
  $COMPOSE up -d --build nginx

  # Ждём, пока порт 80 реально начнёт отвечать: certbot отваливается
  # с «Connection refused», если пойти к нему раньше времени.
  say "Ждём, пока nginx начнёт отвечать на 80 порту"
  for attempt in $(seq 1 30); do
    if curl -fsS -o /dev/null "http://$DOMAIN/.well-known/acme-challenge/ping" ||
       curl -fsS -o /dev/null "http://127.0.0.1/"; then
      break
    fi
    if [[ $attempt -eq 30 ]]; then
      echo "nginx так и не открыл 80 порт. Логи:" >&2
      $COMPOSE logs --tail 40 nginx >&2
      exit 1
    fi
    sleep 2
  done

  $COMPOSE run --rm certbot certonly \
    --webroot -w /var/www/certbot -d "$DOMAIN" \
    --agree-tos -m "$EMAIL" --no-eff-email --non-interactive

  # Сертификат появился — перезапускаем, чтобы подхватился конфиг с HTTPS.
  say "Переключаем nginx на HTTPS"
  $COMPOSE restart nginx
fi

# ─── 8. Запуск ──────────────────────────────────────────────────────────────
say "Собираем и запускаем (первый раз это 5–10 минут)"
$COMPOSE up -d --build

# ─── 9. Регламент: продление сертификата, бэкапы, чистка ────────────────────
say "Ставим задачи по расписанию"
mkdir -p "$ROOT/spasai/deploy/backups"
cat > /etc/cron.d/spasai <<CRON
0 4 * * 1 root cd $ROOT/spasai && $COMPOSE run --rm certbot renew --quiet && $COMPOSE restart nginx
30 3 * * * root cd $ROOT/spasai && $COMPOSE exec -T postgres pg_dump -U spasai spasai | gzip > deploy/backups/spasai-\$(date +\%F).sql.gz && find deploy/backups -name '*.sql.gz' -mtime +3 -delete
0 5 * * 0 root docker system prune -af --filter "until=168h"
CRON

# ─── 10. Проверка ───────────────────────────────────────────────────────────
say "Проверяем"
for attempt in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo
    curl -fsS "https://$DOMAIN/api/health"
    echo
    say "Готово"
    cat <<DONE

Панель заведения:  https://$DOMAIN
Адрес для приложения: https://$DOMAIN/api

Дальше:
  1. Войдите в панель по своему номеру и станьте администратором:
     cd $ROOT/spasai && $COMPOSE exec postgres \\
       psql -U spasai -d spasai -c "UPDATE users SET role='admin' WHERE phone='+7XXXXXXXXXX'"
  2. Пропишите ключи SMS в $ROOT/spasai/deploy/.env и перезапустите:
     $COMPOSE up -d api
     Пока SMS не подключены, вход в приложение работает только через
     кнопку «Войти без кода».

DONE
    exit 0
  fi
  sleep 10
done

echo "Сервис не поднялся за 5 минут. Что говорят логи:" >&2
$COMPOSE logs --tail 40 api >&2
exit 1
