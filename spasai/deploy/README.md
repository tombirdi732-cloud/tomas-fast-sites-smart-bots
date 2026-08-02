# Развёртывание «Спасая» на одном сервере

## Что покупать

**Облачный сервер (VPS) с виртуализацией KVM, Ubuntu 24.04 LTS, локация — Россия.**
Обычный виртуальный хостинг не подойдёт: нужны root, свои порты и Docker.
Локация в РФ обязательна — вы храните телефоны покупателей, а 152-ФЗ требует
держать персональные данные россиян на серверах в России.

| | Тестовый | Боевой минимум | Рекомендуется |
|---|---|---|---|
| CPU | 2 vCPU | 2 vCPU | 4 vCPU |
| RAM | 2 ГБ | 4 ГБ | 8 ГБ |
| Диск | 10 ГБ | 40 ГБ NVMe | 80 ГБ NVMe |

Тестовый вариант (2 vCPU / 2 ГБ / 10 ГБ) стек выдерживает — но только
с оговорками из раздела «Стартовый сервер» ниже. Для боевого запуска
берите от 4 ГБ и 40 ГБ: на 10 ГБ диска не помещаются ни фотографии, ни
месяц бэкапов.

Дополнительно понадобятся:

- **автоматические бэкапы** у провайдера — вы храните заказы и деньги;
- **домен** — вебхук ЮKassa принимается только по HTTPS, а сертификат
  Let's Encrypt на голый IP не выдаётся.

Managed-базу провайдера брать не стоит: в ней может не оказаться расширения
PostGIS, на котором держится весь геопоиск.

## Стартовый сервер: 2 vCPU / 2 ГБ / 10 ГБ

На таком сервере всё работает, но запас нулевой. Куда уходят ресурсы:

| | RAM | Диск |
|---|---|---|
| PostgreSQL + PostGIS | ~350 МБ | образ 700 МБ + база |
| Redis | ~50 МБ | ~50 МБ |
| API (Node) | ~250 МБ | образ ~400 МБ |
| nginx | ~15 МБ | ~50 МБ |
| система Ubuntu + Docker | ~450 МБ | ~3 ГБ |

Остаётся около 800 МБ памяти и 4–5 ГБ диска. Отсюда четыре правила.

**1. Не ставьте Node на сервер.** `npm ci` в корне монорепозитория тянет
и мобильное приложение — больше 1 ГБ памяти, на 2 ГБ это OOM. Поэтому
и API, и панель собираются внутри Docker: каждый образ ставит только свои
зависимости. От вас на сервере нужен один Docker.

**2. Swap — 2 ГБ, не больше.** Диска всего 10 ГБ, файл на 4 ГБ съест почти
половину свободного места.

**3. Фотографии — только во внешнем S3.** Профиль `storage` (MinIO) на этом
сервере не поднимайте: фотографии заведений забьют диск за пару недель.
Заведите бакет в Yandex Object Storage и пропишите его ключи в `.env` —
хранение копеечное, а диск остаётся под базу.

**4. Платежи — `PAYMENTS_MODE=on_pickup`.** Пока вы самозанятый, это
единственный законный режим (см. `docs/payments.md`), и он же снимает
нагрузку: нет вебхуков, нет очереди возвратов.

Ограничения памяти для контейнеров уже прописаны в
`docker-compose.prod.yml`: `shared_buffers=256MB` у Postgres,
`maxmemory=128mb` у Redis, `--max-old-space-size=512` у Node. Логи Docker
ограничены 10 МБ × 3 файла на сервис — без этого журнал однажды забивает
весь диск, и первым падает Postgres.

Признак, что сервер пора менять: `free -m` показывает постоянно занятый
swap, а `docker stats` — API у потолка в 512 МБ.

## Подготовка сервера

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh

# 2. Swap: 2 ГБ на сервере с 2 ГБ RAM и диском 10 ГБ, 4 ГБ — на сервере пожирнее
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
# База не любит агрессивный своп: уходим в него только при реальной нехватке
sysctl -w vm.swappiness=10 && echo 'vm.swappiness=10' >> /etc/sysctl.conf

# 3. Файрвол: наружу только SSH и веб
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# 4. Чистка мусора Docker — иначе старые образы съедают диск
cat > /etc/cron.d/docker-prune <<'CRON'
0 5 * * 0 root docker system prune -af --filter "until=168h"
CRON
```

Направьте A-запись домена на IP сервера и дождитесь, пока она разойдётся
(`dig +short spasai.ru`).

## Первый запуск: одной командой

На чистом Ubuntu 24.04, от root:

```bash
curl -fsSL https://raw.githubusercontent.com/tombirdi732-cloud/tomas-fast-sites-smart-bots/claude/hello-create-hpsvnj/spasai/deploy/bootstrap.sh \
  | bash -s -- spasai.ru you@example.com
```

Домен и почта для сертификата — аргументы. Скрипт проверяет, что A-запись
уже ведёт на этот сервер, добавляет swap, ставит Docker, закрывает файрвол,
забирает код, генерирует секреты, выпускает сертификат, собирает и
запускает всё и ставит задачи по расписанию. Повторный запуск безопасен:
сделанное пропускается.

Панель заведения собирается **внутри образа** (`apps/web/Dockerfile`) —
Node на сервере не нужен, и сборка не упирается в 2 ГБ памяти.

Ниже — то же самое по шагам, если хочется контролировать каждый.

## Первый запуск вручную

```bash
git clone <репозиторий> /opt/spasai && cd /opt/spasai/spasai

cp deploy/.env.example deploy/.env
# заполните секреты: openssl rand -base64 48
nano deploy/.env

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
cd spasai && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build api nginx
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
На диске в 10 ГБ держите не 14 дней, а 3–4 (`-mtime +3`), а суточную копию
сразу отправляйте в объектное хранилище:

```
0 4 * * * cd /opt/spasai/spasai && aws s3 cp --endpoint-url https://storage.yandexcloud.net "$(ls -t deploy/backups/*.sql.gz | head -1)" s3://spasai-backups/
```

## Что подключить своими ключами

| Что | Где взять | Куда положить |
|---|---|---|
| ЮKassa | кабинет магазина | `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` |
| Вебхук ЮKassa | кабинет → уведомления | `https://ваш-домен/api/webhooks/yookassa`, события `payment.succeeded`, `payment.canceled`, `refund.succeeded` |
| SMS | кабинет sms.ru или smsc.ru | `SMS_PROVIDER` + ключи; имя отправителя согласуется заранее |
| Пуши | Firebase → сервисный аккаунт | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` |
| Карты | кабинет Яндекс.Карт | ключ MapKit для мобильного приложения |
| Sentry | sentry.io | `SENTRY_DSN` |

**Пока SMS не подключены.** Сервер стартует и без ключей провайдера, но
вход по номеру работать не будет: код просто некому отправить. На это время
в `.env` стоит `DEMO_LOGIN=true` — в приложении появляется кнопка «Войти без
кода», которая заводит новый пустой аккаунт в служебном диапазоне номеров.
Чужой аккаунт ей не открыть, но завести себе может кто угодно, поэтому
выключайте (`DEMO_LOGIN=false`), как только заработает рассылка. Если и SMS
не настроены, и демо-вход выключен, сервер не стартует: войти было бы некому.

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
