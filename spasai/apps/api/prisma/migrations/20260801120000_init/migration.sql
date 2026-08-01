-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('customer', 'merchant', 'admin');

-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('pending', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "BoxStatus" AS ENUM ('active', 'sold_out', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending_payment', 'paid', 'ready', 'collected', 'cancelled', 'refunded', 'no_show');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'paid');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('order_paid', 'pickup_reminder', 'order_collected', 'order_cancelled', 'order_no_show', 'refund', 'favorite_new_box', 'merchant_approved', 'merchant_rejected', 'system');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120),
    "email" VARCHAR(255),
    "avatar_url" VARCHAR(1024),
    "role" "UserRole" NOT NULL DEFAULT 'customer',
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "fcm_token" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(64) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "logo_url" VARCHAR(1024),
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "inn" VARCHAR(12) NOT NULL,
    "legal_name" VARCHAR(300) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow',
    "status" "MerchantStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "commission_rate" DECIMAL(4,3) NOT NULL DEFAULT 0.20,
    "rating_avg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boxes" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "original_price" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "quantity_total" INTEGER NOT NULL,
    "quantity_left" INTEGER NOT NULL,
    "best_before" TIMESTAMPTZ(6) NOT NULL,
    "pickup_start" TIMESTAMPTZ(6) NOT NULL,
    "pickup_end" TIMESTAMPTZ(6) NOT NULL,
    "photo_url" VARCHAR(1024),
    "category" VARCHAR(64) NOT NULL,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "BoxStatus" NOT NULL DEFAULT 'active',
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_rule" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "boxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "box_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "box_price" INTEGER NOT NULL,
    "service_fee" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "commission_amount" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending_payment',
    "pickup_code" CHAR(6),
    "payment_id" VARCHAR(128),
    "paid_at" TIMESTAMPTZ(6),
    "collected_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "reply" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "gross_amount" INTEGER NOT NULL,
    "commission_amount" INTEGER NOT NULL,
    "net_amount" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "payload_json" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_verifications" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "code_hash" VARCHAR(128) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "default_commission_rate" DECIMAL(4,3) NOT NULL DEFAULT 0.20,
    "service_fee" INTEGER NOT NULL DEFAULT 2900,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "merchants_owner_user_id_idx" ON "merchants"("owner_user_id");

-- CreateIndex
CREATE INDEX "merchants_status_idx" ON "merchants"("status");

-- CreateIndex
CREATE INDEX "merchants_category_idx" ON "merchants"("category");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_inn_key" ON "merchants"("inn");

-- CreateIndex
CREATE INDEX "boxes_merchant_id_idx" ON "boxes"("merchant_id");

-- CreateIndex
CREATE INDEX "boxes_status_pickup_end_idx" ON "boxes"("status", "pickup_end");

-- CreateIndex
CREATE INDEX "boxes_category_idx" ON "boxes"("category");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_merchant_id_status_idx" ON "orders"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "orders_box_id_idx" ON "orders"("box_id");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_payment_id_key" ON "orders"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_id_key" ON "reviews"("order_id");

-- CreateIndex
CREATE INDEX "reviews_merchant_id_created_at_idx" ON "reviews"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_merchant_id_period_start_period_end_key" ON "payouts"("merchant_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "favorites_merchant_id_idx" ON "favorites"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_user_id_merchant_id_key" ON "favorites"("user_id", "merchant_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "phone_verifications_phone_created_at_idx" ON "phone_verifications"("phone", "created_at");

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_box_id_fkey" FOREIGN KEY ("box_id") REFERENCES "boxes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ════════════════════════════════════════════════════════════════════════════
-- Инварианты бизнес-логики (раздел 7 ТЗ), выраженные на уровне БД.
-- Дублируют серверную валидацию: даже кривой скрипт не сможет записать
-- невозможные данные.
-- ════════════════════════════════════════════════════════════════════════════

-- 7.1 Срок годности обязан наступать ПОЗЖЕ конца окна выдачи.
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_best_before_after_pickup_end"
  CHECK ("best_before" > "pickup_end");
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_pickup_window_valid"
  CHECK ("pickup_end" > "pickup_start");
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_quantity_valid"
  CHECK ("quantity_total" > 0 AND "quantity_left" >= 0 AND "quantity_left" <= "quantity_total");
-- Цены в копейках, скидка не может быть отрицательной.
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_price_valid"
  CHECK ("price" >= 0 AND "original_price" >= "price");
ALTER TABLE "boxes" ADD CONSTRAINT "boxes_recurrence_rule_required"
  CHECK (NOT "is_recurring" OR "recurrence_rule" IS NOT NULL);

-- Заведение: координаты, комиссия, ИНН (10 знаков — юрлицо, 12 — ИП).
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_lat_range"
  CHECK ("lat" >= -90 AND "lat" <= 90);
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_lng_range"
  CHECK ("lng" >= -180 AND "lng" <= 180);
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_commission_rate_range"
  CHECK ("commission_rate" >= 0 AND "commission_rate" <= 1);
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_inn_format"
  CHECK ("inn" ~ '^[0-9]{10}([0-9]{2})?$');
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_rating_range"
  CHECK ("rating_avg" >= 0 AND "rating_avg" <= 5 AND "rating_count" >= 0);

-- 7.4 Денежная разбивка заказа. Все суммы — целые копейки.
ALTER TABLE "orders" ADD CONSTRAINT "orders_quantity_positive"
  CHECK ("quantity" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_non_negative"
  CHECK ("box_price" >= 0 AND "service_fee" >= 0 AND "total" >= 0 AND "commission_amount" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_matches_breakdown"
  CHECK ("total" = "box_price" * "quantity" + "service_fee");
ALTER TABLE "orders" ADD CONSTRAINT "orders_commission_within_gross"
  CHECK ("commission_amount" <= "box_price" * "quantity");
-- 7.5 Код выдачи — ровно 6 цифр.
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_code_digits"
  CHECK ("pickup_code" IS NULL OR "pickup_code" ~ '^[0-9]{6}$');

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range"
  CHECK ("rating" >= 1 AND "rating" <= 5);

ALTER TABLE "payouts" ADD CONSTRAINT "payouts_net_matches_breakdown"
  CHECK ("net_amount" = "gross_amount" - "commission_amount");
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_period_valid"
  CHECK ("period_end" > "period_start");

-- Настройки платформы — ровно одна строка.
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_singleton"
  CHECK ("id" = 1);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_commission_range"
  CHECK ("default_commission_rate" >= 0 AND "default_commission_rate" <= 1);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_service_fee_non_negative"
  CHECK ("service_fee" >= 0);

-- ════════════════════════════════════════════════════════════════════════════
-- Геопоиск (раздел 7.8). Индекс по выражению — отдельная geometry-колонка не
-- нужна, схема остаётся полностью описанной в schema.prisma.
--
-- Запрос:
--   SELECT *, ST_Distance(
--            ST_SetSRID(ST_MakePoint(m.lng, m.lat), 4326)::geography,
--            ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography) AS distance_m
--   FROM merchants m
--   WHERE ST_DWithin(
--           ST_SetSRID(ST_MakePoint(m.lng, m.lat), 4326)::geography,
--           ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography, $radius_m)
--   ORDER BY distance_m;
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX "merchants_geo_idx" ON "merchants"
  USING GIST ((ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography));

-- ════════════════════════════════════════════════════════════════════════════
-- 7.5 Код выдачи уникален в рамках заведения на текущие сутки.
-- Ограничение действует только для заказов, которые реально можно выдать.
-- ════════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX "orders_merchant_pickup_code_day_key" ON "orders"
  ("merchant_id", "pickup_code", ((timezone('UTC', "created_at"))::date))
  WHERE "pickup_code" IS NOT NULL AND "status" IN ('paid', 'ready');

-- Единственная строка настроек платформы.
INSERT INTO "platform_settings" ("id", "default_commission_rate", "service_fee", "updated_at")
VALUES (1, 0.200, 2900, NOW())
ON CONFLICT ("id") DO NOTHING;
