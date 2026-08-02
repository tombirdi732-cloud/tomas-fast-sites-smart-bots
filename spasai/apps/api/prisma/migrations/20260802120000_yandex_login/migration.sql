-- Вход через Яндекс ID.
--
-- Telegram с российского хостинга недоступен: трафик до api.telegram.org
-- не проходит, и обратно вебхук тоже не доставляется. Яндекс — российский
-- сервис, до него сервер дотягивается без посредников.

ALTER TABLE "users" ADD COLUMN "yandex_id" VARCHAR(64);
CREATE UNIQUE INDEX "users_yandex_id_key" ON "users"("yandex_id");

-- Способов входа стало три, проверка обновляется под них.
ALTER TABLE "users" DROP CONSTRAINT "users_login_method_present";
ALTER TABLE "users"
  ADD CONSTRAINT "users_login_method_present"
  CHECK ("phone" IS NOT NULL OR "telegram_id" IS NOT NULL OR "yandex_id" IS NOT NULL);

-- Таблица начатых входов становится общей для всех внешних сервисов.
-- Записи живут минуты, поэтому переносить их незачем.
DROP TABLE IF EXISTS "telegram_logins";

CREATE TABLE "external_logins" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "state" VARCHAR(64) NOT NULL,
    "external_id" VARCHAR(64),
    "login" VARCHAR(120),
    "display_name" VARCHAR(120),
    "email" VARCHAR(255),
    "confirmed_at" TIMESTAMPTZ(6),
    "used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_logins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_logins_state_key" ON "external_logins"("state");
CREATE INDEX "external_logins_expires_at_idx" ON "external_logins"("expires_at");
