-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "selected_city" TEXT NOT NULL DEFAULT 'london';

-- CreateIndex
CREATE INDEX "subscriptions_selected_city_idx" ON "subscriptions"("selected_city");

-- CreateTable
CREATE TABLE "user_preferences" (
    "clerk_user_id" TEXT NOT NULL,
    "selected_city" TEXT NOT NULL DEFAULT 'london',
    "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("clerk_user_id")
);

-- CreateIndex
CREATE INDEX "user_preferences_selected_city_idx" ON "user_preferences"("selected_city");

-- CreateIndex
CREATE INDEX "user_preferences_notifications_enabled_idx" ON "user_preferences"("notifications_enabled");

-- Backfill SMS subscriber city column default (zone_id may be null)
UPDATE "sms_subscribers" SET "zone_id" = 'london' WHERE "zone_id" IS NULL;

ALTER TABLE "sms_subscribers" ALTER COLUMN "zone_id" SET DEFAULT 'london';
ALTER TABLE "sms_subscribers" ALTER COLUMN "zone_id" SET NOT NULL;
