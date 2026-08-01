# «Спасай» — маркетплейс еды с истекающим сроком

Монорепо проекта. Разработка идёт по этапам из раздела 9 ТЗ.

| Этап | Что | Статус |
|---|---|---|
| 1 | Фундамент: монорепо, NestJS + Prisma + PostgreSQL/PostGIS, схема БД, миграции, docker-compose | ✅ готово |
| 2 | Авторизация по телефону, JWT, guard'ы по ролям | ✅ готово |
| 3 | Ядро API: боксы, геопоиск, заказы, бизнес-логика | ✅ готово |
| 4 | Панель заведения | ✅ готово |
| 5 | Мобильное приложение | — |
| 6 | Платежи (ЮKassa) | — |
| 7 | Пуши и фоновые задачи | — |
| 8 | Админка | — |
| 9 | Продакшн | — |

## Структура

```
spasai/
├── apps/
│   ├── api/          NestJS + Prisma — бэкенд
│   ├── web/          панель заведения (React + Vite), админка — этап 8
│   └── mobile/       Expo-приложение покупателя (этап 5)
└── docker-compose.yml
```

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
- `PlatformSettings` — глобальная комиссия и сервисный сбор (этап 8), одна строка `id = 1`.

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
POST   /auth/verify-code           публичный, в dev код всегда 0000
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
GET    /merchants/:id              публичный
GET    /merchants/me
GET    /merchants/me/stats
PATCH  /merchants/me/:id
GET    /merchants/me/boxes         роль merchant
POST   /merchants/me/boxes
PATCH  /merchants/me/boxes/:id
GET    /merchants/me/orders?pending=true
POST   /merchants/me/orders/collect  { pickupCode }

POST   /reviews                    только по полученному заказу, один раз
GET    /reviews?merchantId=        публичный
POST   /reviews/:id/reply          роль merchant

GET    /favorites   POST /favorites   DELETE /favorites/:merchantId
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

## Демо-данные

`npm run api -- db:seed` создаёт админа `+79990000000`, владельца заведений
`+79990000001`, покупателя `+79990000002`, два одобренных заведения в центре
Москвы и два активных бокса.
