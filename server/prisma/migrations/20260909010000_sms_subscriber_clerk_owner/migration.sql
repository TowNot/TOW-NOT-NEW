-- AlterTable
ALTER TABLE "sms_subscribers" ADD COLUMN "clerk_user_id" TEXT;

-- CreateIndex
CREATE INDEX "sms_subscribers_clerk_user_id_idx" ON "sms_subscribers"("clerk_user_id");
