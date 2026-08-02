-- Вход через Telegram: бесплатная альтернатива SMS.
--
-- Телефон перестаёт быть обязательным — пользователь, пришедший из Telegram,
-- его вообще не сообщает. Для выдачи заказа номер и не нужен: там код.

ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;

ALTER TABLE "users" ADD COLUMN "telegram_id" VARCHAR(32);
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- Способ входа должен быть хотя бы один, иначе в аккаунт не попасть никогда.
ALTER TABLE "users"
  ADD CONSTRAINT "users_login_method_present"
  CHECK ("phone" IS NOT NULL OR "telegram_id" IS NOT NULL);

-- Начатые входы: живут минуты, подтверждаются вебхуком от бота.
CREATE TABLE "telegram_logins" (
    "id" UUID NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "telegram_id" VARCHAR(32),
    "username" VARCHAR(64),
    "first_name" VARCHAR(120),
    "confirmed_at" TIMESTAMPTZ(6),
    "used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_logins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_logins_nonce_key" ON "telegram_logins"("nonce");
CREATE INDEX "telegram_logins_expires_at_idx" ON "telegram_logins"("expires_at");
