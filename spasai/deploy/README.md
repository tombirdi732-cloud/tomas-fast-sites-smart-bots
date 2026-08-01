# Развёртывание «Спасая» на одном сервере

## Что покупать

**Облачный сервер (VPS) с виртуализацией KVM, Ubuntu 24.04 LTS, локация — Россия.**
Обычный виртуальный хостинг не подойдёт: нужны root, свои порты и Docker.
Локация в РФ обязательна — вы храните телефоны покупателей, а 152-ФЗ требует
держать персональные данные россиян на серверах в России.

| | Минимум | Рекомендуется |
|---|---|---|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 ГБ | 8 ГБ |
| Диск | 40 ГБ NVMe | 80 ГБ NVMe |

На 4 ГБ сборка проекта прямо на сервере не поместится — добавьте swap
(см. ниже) или собирайте образ в CI.

Дополнительно понадобятся:

- **автоматические бэкапы** у провайдера — вы храните заказы и деньги;
- **домен** — вебхук ЮKassa принимается только по HTTPS, а сертификат
  Let's Encrypt на голый IP не выдаётся.

Managed-базу провайдера брать не стоит: в ней может не оказаться расширения
PostGIS, на котором держится весь геопоиск.

## Подготовка сервера

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh

# 2. Swap — обязателен на 4 ГБ, лишним не будет и на 8
fallocate -l 4G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# 3. Файрвол: наружу только SSH и веб
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
```

Направьте A-запись домена на IP сервера и дождитесь, пока она разойдётся
(`dig +short spasai.ru`).

## Первый запуск

```bash
git clone <репозиторий> /opt/spasai && cd /opt/spasai/spasai

cp deploy/.env.example deploy/.env
# заполните секреты: openssl rand -base64 48
nano deploy/.env

# Панель заведения — статика, её собирает Vite
npm ci && npm run web:build

# Сертификат: сначала поднимаем nginx на 80, затем выпускаем
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d nginx
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env \
  run --rm --profile certbot certbot certonly \
  --webroot -w /var/www/certbot -d spasai.ru --agree-tos -m you@example.com --no-eff-email

# Всё остальное. Миграции применяются на старте контейнера api
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

Проверка: `curl https://spasai.ru/api/health` — должно вернуться
`"status":"ok"` и версия PostGIS.

Первый администратор назначается вручную — в базе нет ролей заранее:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env \
  exec postgres psql -U spasai -d spasai \
  -c "UPDATE users SET role='admin' WHERE phone='+7XXXXXXXXXX'"
```

(Сначала войдите этим номером в панели, чтобы пользователь появился.)

## Обновление

```bash
cd /opt/spasai && git pull
cd spasai && npm ci && npm run web:build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build api nginx
```

## Регламент

**Продление сертификата** — в crontab хоста:

```
0 4 * * 1 cd /opt/spasai/spasai && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env run --rm --profile certbot certbot renew --quiet && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env restart nginx
```

**Бэкап базы** — раз в сутки, поверх бэкапов провайдера:

```
30 3 * * * cd /opt/spasai/spasai && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T postgres pg_dump -U spasai spasai | gzip > deploy/backups/spasai-$(date +\%F).sql.gz && find deploy/backups -name '*.sql.gz' -mtime +14 -delete
```

Бэкапы обязательно копируйте с сервера наружу — диск умирает вместе с базой.

## Что подключить своими ключами

| Что | Где взять | Куда положить |
|---|---|---|
| ЮKassa | кабинет магазина | `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` |
| Вебхук ЮKassa | кабинет → уведомления | `https://ваш-домен/api/webhooks/yookassa`, события `payment.succeeded`, `payment.canceled`, `refund.succeeded` |
| SMS | кабинет sms.ru или smsc.ru | `SMS_PROVIDER` + ключи; имя отправителя согласуется заранее |
| Пуши | Firebase → сервисный аккаунт | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` |
| Карты | кабинет Яндекс.Карт | ключ MapKit для мобильного приложения |
| Sentry | sentry.io | `SENTRY_DSN` |

Без ключей ЮKassa приём платежей выключен, без ключей FCM уведомления
только пишутся в базу. `SMS_PROVIDER=stub` в production запрещён — иначе
вход по коду `0000` был бы открыт кому угодно, поэтому приложение просто
не стартует.

**Про SMS отдельно.** Регистрация в sms.ru или smsc.ru занимает минуты,
но согласование имени отправителя у операторов — несколько дней и требует
документов юрлица. Пока имя не согласовано, сообщения уходят с общего
номера провайдера: работает, но выглядит хуже. Закладывайте эту неделю
в план запуска.

## Перед публичным запуском

- подать уведомление оператора персональных данных в Роскомнадзор;
- опубликовать политику обработки персданных и пользовательское соглашение;
- проверить, что фискальные чеки уходят (54-ФЗ) — тестовым платежом в ЮKassa;
- убедиться, что бэкапы восстанавливаются, а не просто создаются.
