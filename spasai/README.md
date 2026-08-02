# «Спасай» — маркетплейс еды с истекающим сроком

Монорепо проекта. Разработка идёт по этапам из раздела 9 ТЗ.

| Этап | Что | Статус |
|---|---|---|
| 1 | Фундамент: монорепо, NestJS + Prisma + PostgreSQL/PostGIS, схема БД, миграции, docker-compose | ✅ готово |
| 2 | Авторизация по телефону, JWT, guard'ы по ролям | ✅ готово |
| 3 | Ядро API: боксы, геопоиск, заказы, бизнес-логика | ✅ готово |
| 4 | Панель заведения | ✅ готово |
| 5 | Мобильное приложение | ✅ готово |
| 6 | Платежи (ЮKassa) | ✅ готово (нужны ключи магазина) |
| 7 | Пуши и фоновые задачи | ✅ готово (нужен сервисный аккаунт FCM) |
| 8 | Админка | ✅ готово (API) |
| 9 | Продакшн | CI, Sentry, сборка APK — ✅; деплой и публикация — за вами |

## Структура

```
spasai/
├── apps/
│   ├── api/          NestJS + Prisma — бэкенд
│   ├── web/          панель заведения (React + Vite), админка — этап 8
│   └── mobile/       Expo-приложение покупателя (React Native + Expo)
├── deploy/           боевой compose, nginx, инструкция по серверу
└── docker-compose.yml
```

Нативные проекты `apps/mobile/android` и `apps/mobile/ios` не хранятся в
репозитории — они генерируются командой `npx expo prebuild`.

## Быстрый старт

Нужны Node.js 20+ и Docker.

```bash
cd spasai
npm install

# PostgreSQL с PostGIS, Redis и MinIO
npm run db:up

cp apps/api/.env.example apps/api/.env

# Применить миграции и залить демо-данные
npm run db:deploy
npm run api -- db:seed

# Запустить API
npm run api:dev
```

Проверка: `curl http://localhost:3000/api/health` — ответ должен содержать
`"status":"ok"` и версию PostGIS.

Альтернатива — поднять API прямо в Compose:

```bash
docker compose --profile api up -d
```

### Сервисы локально

| Сервис | Адрес | Логин / пароль |
|---|---|---|
| PostgreSQL 16 + PostGIS 3.4 | `localhost:5432` | `spasai` / `spasai`, БД `spasai` |
| Redis 7 | `localhost:6379` | — |
| MinIO (S3) | `localhost:9000`, консоль `:9001` | `spasai` / `spasai-secret` |
| API | `localhost:3000/api` | — |

## Команды

```bash
npm run api:dev        # NestJS в watch-режиме
npm run web:dev        # панель заведения на http://localhost:5173
npm run api:build      # сборка
npm run api:test       # юнит-тесты
npm run db:migrate     # prisma migrate dev — создать новую миграцию
npm run db:deploy      # prisma migrate deploy — применить существующие
npm run db:reset       # снести и пересоздать БД (с сидом)
npm run api -- lint    # eslint
npm run api -- typecheck
```

## Схема БД

Модели из раздела 3 ТЗ: `User`, `Merchant`, `Box`, `Order`, `Review`, `Payout`,
`Favorite`, `Notification`. Дополнительно заведены две служебные таблицы:

- `PhoneVerification` — одноразовые SMS-коды для входа (этап 2);
- `PlatformSettings` — глобальная комиссия и сервисный сбор (этап 8), одна строка `id = 1`;
- `RefreshToken` — refresh-токены (хранятся как HMAC-хеши, не в открытом виде);
- `MerchantStaff` и `MerchantInvite` — доступ к панели: владелец, кассиры и
  одноразовые коды приглашений (см. [`docs/access.md`](docs/access.md)).

### Соглашения

- **Деньги** — целые числа в **копейках** (`Int`). Никаких `float`/`Decimal`
  для сумм. `Decimal` используется только для долей: `commission_rate`, `rating_avg`.
- **Даты** — `timestamptz`, всегда UTC. У заведения есть поле `timezone`
  (IANA) для конвертации при отображении.
- В коде — `camelCase`, в БД — `snake_case` (через `@map` / `@@map`).

### Инварианты на уровне БД

Правила раздела 7 ТЗ продублированы CHECK-констрейнтами, чтобы их нельзя было
обойти мимо сервисного слоя:

| Правило | Констрейнт |
|---|---|
| 7.1 срок годности позже конца окна выдачи | `boxes_best_before_after_pickup_end` |
| корректное окно выдачи | `boxes_pickup_window_valid` |
| остаток не больше общего количества | `boxes_quantity_valid` |
| цена со скидкой не выше исходной | `boxes_price_valid` |
| 7.4 `total = box_price * quantity + service_fee` | `orders_total_matches_breakdown` |
| комиссия не больше суммы боксов | `orders_commission_within_gross` |
| 7.5 код выдачи — ровно 6 цифр | `orders_pickup_code_digits` |
| 7.5 код уникален: заведение + сутки | `orders_merchant_pickup_code_day_key` (частичный UNIQUE) |
| рейтинг 1..5 | `reviews_rating_range` |
| `net = gross - commission` | `payouts_net_matches_breakdown` |

### Геопоиск (7.8)

Отдельная geometry-колонка не заводилась — вместо неё GiST-индекс по выражению
`merchants_geo_idx`, поэтому схема полностью описана в `schema.prisma`:

```sql
SELECT m.*, ST_Distance(
         ST_SetSRID(ST_MakePoint(m.lng, m.lat), 4326)::geography,
         ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography) AS distance_m
FROM merchants m
WHERE ST_DWithin(
        ST_SetSRID(ST_MakePoint(m.lng, m.lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography, $radius_m)
ORDER BY distance_m;
```

> ⚠️ CHECK-констрейнты, частичный UNIQUE и индекс по выражению написаны вручную
> в `prisma/migrations/20260801120000_init/migration.sql` — Prisma их не умеет
> выражать в схеме. При `prisma migrate dev` **проверяйте сгенерированный SQL**:
> если Prisma попытается их удалить, уберите эти строки из новой миграции.

## Эндпоинты

Все пути с префиксом `/api`. Без пометки «публичный» требуется
`Authorization: Bearer <access>`.

```
POST   /auth/request-code          публичный, 1 код в минуту на номер
POST   /auth/verify-code           публичный, при SMS_PROVIDER=stub код 0000
POST   /auth/demo                  публичный, вход без номера при DEMO_LOGIN=true
POST   /auth/telegram/start        публичный, ссылка на бота для входа
POST   /auth/telegram/poll         публичный, { nonce } → pending либо токены
POST   /webhooks/telegram          от Telegram, проверяется секретным заголовком
POST   /auth/refresh               публичный, ротация токена
POST   /auth/logout                публичный, отзыв refresh
GET    /auth/me    PATCH /auth/me

GET    /boxes?lat&lng&radius&category&maxPrice&pickupBefore&limit&offset   публичный
GET    /boxes/:id                                                          публичный

POST   /orders                     { boxId, quantity } → бронь
GET    /orders?active=true
GET    /orders/:id
POST   /orders/:id/cancel
POST   /orders/:id/pay-dev         только в dev, заменится вебхуком ЮKassa

POST   /merchants                  заявка на регистрацию → на модерацию
                                   { …, inviteCode? } — по коду платформы одобряется сразу
GET    /merchants/address-suggest?query=   подсказки адреса с координатами
GET    /merchants/:id              публичный
GET    /merchants/me
GET    /merchants/me/stats
PATCH  /merchants/me/:id
GET    /merchants/me/boxes         роль merchant
POST   /merchants/me/boxes
PATCH  /merchants/me/boxes/:id
GET    /merchants/me/orders?pending=true
POST   /merchants/me/orders/collect  { pickupCode }

GET    /merchants/me/staff           сотрудники заведения
POST   /merchants/me/staff/invite    { note?, expiresInDays? } → код для кассира
DELETE /merchants/me/staff/:userId   только владелец, владельца убрать нельзя
POST   /merchants/join               { code } — вход сотрудника по коду

POST   /reviews                    только по полученному заказу, один раз
GET    /reviews?merchantId=        публичный
POST   /reviews/:id/reply          роль merchant

GET    /favorites   POST /favorites   DELETE /favorites/:merchantId

GET    /admin/merchants?status               роль admin
POST   /admin/invites                        { note?, expiresInDays? } → код заведению
POST   /admin/merchants/:id/approve
POST   /admin/merchants/:id/reject           { reason }
POST   /admin/merchants/:id/suspend          { reason }
PATCH  /admin/merchants/:id/commission       { commissionRate }
GET    /admin/settings   PATCH /admin/settings
GET    /admin/users?search   PATCH /admin/users/:id/block
GET    /admin/orders?status  POST  /admin/orders/:id/refund
GET    /admin/stats                          GMV, выручка платформы, топ заведений
POST   /admin/maintenance/run                прогнать фоновые задачи вручную
```

Владелец нескольких точек передаёт `?merchantId=` в эндпоинты `/merchants/me/*`;
без параметра берётся первое заведение пользователя.

## Реализованные правила раздела 7

| # | Правило | Где |
|---|---|---|
| 7.1 | `best_before > pickup_end` | `BoxesService.assertBoxRules` + CHECK в БД |
| 7.2 | Транзакционное резервирование с `SELECT … FOR UPDATE`; бронь снимается через 10 минут без оплаты | `OrdersService.create`, `releaseUnpaidOrders` |
| 7.3 | Cron каждые 5 минут переводит боксы в `expired` | `SchedulerService.expireBoxes` |
| 7.4 | `total = price × quantity + service_fee`, комиссия и доля заведения | `calculateOrderAmounts` |
| 7.5 | Код выдачи: 6 цифр, уникален по заведению за сутки, генерируется при оплате | `OrdersService.markPaid` |
| 7.6 | Не забрали до `pickup_end` → `no_show`, деньги не возвращаются | `OrdersService.markNoShows` |
| 7.7 | Бесплатная отмена не позже чем за 2 часа до `pickup_start` | `OrdersService.cancelByCustomer` |
| 7.8 | `ST_DWithin` по радиусу, сортировка по расстоянию | `BoxesService.search` |
| 7.9 | Пуши — этап 7 | — |

## Формат ошибок API

Единый для всех эндпоинтов (раздел 10 ТЗ):

```json
{ "code": "VALIDATION_FAILED", "message": "Ошибка валидации входных данных", "details": ["price must be a positive number"] }
```

Приведением занимается `AllExceptionsFilter`. Детали внутренних ошибок наружу
не попадают — остаются в логах.

## SMS

Провайдер выбирается переменной `SMS_PROVIDER`:

| Значение | Что делает |
|---|---|
| `stub` | Код всегда `0000`, ничего не отправляется. Код возвращается в ответе `request-code` и показывается на экране входа. В production запрещён — приложение не стартует. |
| `smsru` | sms.ru, нужен `SMS_API_ID` |
| `smsc` | smsc.ru, нужны `SMS_LOGIN` и `SMS_PASSWORD` |

Оба провайдера возвращают отказ не HTTP-статусом, а полем в теле ответа —
это разбирается. Если отправка не удалась, запись о коде удаляется, чтобы
минутный кулдаун не сгорел впустую, а клиент получает `SMS_SEND_FAILED`.

> Имя отправителя (`SMS_SENDER`) согласуется с оператором заранее и требует
> документов юрлица — на это уходит несколько дней. Без согласованного имени
> сообщения уходят с общего номера провайдера.

## Карта

Подложка — Яндекс.Карты (MapKit Mobile SDK, версия Lite). Ключ задаётся
переменной `EXPO_PUBLIC_MAPKIT_API_KEY` в `apps/mobile/.env`; без него
экран карты рисует схему и приложение остаётся рабочим. Что нужно завести
в кабинете Яндекса и что попадает под бесплатный тариф —
в [`docs/maps.md`](docs/maps.md).

MapKit требует Android 8.0, поэтому `minSdkVersion` поднят до 26.

## Доступ заведений и модерация

Как выдавать доступ ресторанам, что проверяется по ИНН автоматически и чем
владелец отличается от кассира — в [`docs/access.md`](docs/access.md).

## Вход

| Способ | Чего стоит | Когда работает |
|---|---|---|
| Telegram-бот | бесплатно | заданы `TELEGRAM_BOT_TOKEN` и `TELEGRAM_BOT_USERNAME` |
| SMS-код | платно, от 4 ₽ за сообщение | задан провайдер и его ключи |
| Демо-вход | бесплатно | `DEMO_LOGIN=true`, временная мера |

Телефон необязателен: у пришедших через Telegram его нет вовсе, а для
выдачи заказа он и не нужен — там код. На уровне БД стоит CHECK, что хотя
бы один способ входа у пользователя остался: `users_login_method_present`.

Онлайн-оплата аккаунту без телефона недоступна — в чеке по 54-ФЗ обязателен
контакт покупателя, и API об этом прямо говорит.

## Деньги

Режим приёма оплаты переключается переменной `PAYMENTS_MODE`:

| Значение | Кто принимает деньги |
|---|---|
| `on_pickup` (по умолчанию) | заведение на своей кассе; платформа денег не касается, сервисный сбор не берётся |
| `online` | платформа через ЮKassa; нужны эквайринг, касса по 54-ФЗ и агентский договор |

Самозанятому доступен только `on_pickup`: НПД запрещает посреднические
доходы. Подробно — в [`docs/payments.md`](docs/payments.md).

## Демо-данные

`npm run api -- db:seed` создаёт админа `+79990000000`, владельца заведений
`+79990000001`, покупателя `+79990000002`, два одобренных заведения в центре
Москвы и два активных бокса.

> В production сид не запускается: он падает с ошибкой при `NODE_ENV=production`.
> Боевая база должна содержать только настоящие заведения, прошедшие модерацию —
> ни выдуманных боксов, ни выдуманных отзывов там быть не должно.

## Скриншоты

Экраны панели и админки — в [`docs/screens/`](docs/screens/README.md).

## Сборка APK

```bash
cd apps/mobile
npx expo prebuild --platform android      # генерирует android/
cd android && ./gradlew assembleRelease
# apk: app/build/outputs/apk/release/app-release.apk
```

Нужны JDK 17+ и Android SDK (`platforms;android-35`, `build-tools;35.0.0`),
переменная `ANDROID_HOME` должна указывать на SDK.

Сборка подписывается отладочным ключом Expo — она устанавливается на телефон,
но в RuStore и Google Play с таким ключом не принимают. Для публикации нужен
свой keystore: положите его в `android/app` и пропишите `signingConfigs` в
`android/app/build.gradle`, либо соберите через EAS:

```bash
npx eas build --platform android --profile production
```

**Адрес бэкенда.** По умолчанию приложение стучится в `http://10.0.2.2:3000/api`
(так эмулятор Android видит localhost хоста). На реальном телефоне адрес
задаётся на экране входа: ссылка «Сервер: …» под кнопкой получения кода.
Укажите адрес машины в той же сети, например `http://192.168.0.10:3000/api`,
и запустите API с `--host 0.0.0.0` (он и так слушает все интерфейсы).

## Продакшн

Пошаговая инструкция по серверу, домену, сертификату и регламенту —
в [`deploy/README.md`](deploy/README.md). Коротко: облачный сервер KVM,
Ubuntu 24.04, от 2 vCPU / 4 ГБ / 40 ГБ NVMe, обязательно в России (152-ФЗ),
плюс домен. Для тестов хватит 2 vCPU / 2 ГБ / 10 ГБ — там свои оговорки,
они описаны отдельным разделом в той же инструкции.

- **CI** — `.github/workflows/spasai-ci.yml`: линт, типы, тесты и сборка для
  API, панели и мобильного приложения; миграции проверяются на чистой базе
  с PostGIS, а собранный API поднимается и проверяется через `/api/health`.
- **Sentry** — включается переменной `SENTRY_DSN`. Тела запросов в события не
  попадают: там телефоны и коды выдачи (152-ФЗ).
- **Что нужно подключить своими руками:** ключи магазина ЮKassa,
  сервисный аккаунт FCM, SMS-провайдер (`SmsService.send`), ключ Яндекс.Карт
  для подложки на экране карты, хостинг в РФ и домен для вебхука
  `/api/webhooks/yookassa`.

## Что осталось за рамками MVP

По разделу 11 ТЗ: доставка, чат с заведением, лояльность, рефералы, подписки,
мультиязычность, веб-версия для покупателей, интеграция с 1С.
