-- CreateTable
CREATE TABLE "merchant_staff" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(16) NOT NULL DEFAULT 'staff',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_invites" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "merchant_id" UUID,
    "note" VARCHAR(300),
    "created_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "used_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_staff_user_id_idx" ON "merchant_staff"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_staff_merchant_id_user_id_key" ON "merchant_staff"("merchant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_invites_code_key" ON "merchant_invites"("code");

-- CreateIndex
CREATE INDEX "merchant_invites_merchant_id_idx" ON "merchant_invites"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_invites_expires_at_idx" ON "merchant_invites"("expires_at");

-- AddForeignKey
ALTER TABLE "merchant_staff" ADD CONSTRAINT "merchant_staff_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_staff" ADD CONSTRAINT "merchant_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_invites" ADD CONSTRAINT "merchant_invites_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

