-- Track whether a subscriber has already used a trial. Never cleared on cancel.
ALTER TABLE "subscriptions" ADD COLUMN "trial_used" BOOLEAN NOT NULL DEFAULT false;

UPDATE "subscriptions"
SET "trial_used" = true
WHERE status IN ('trialing', 'active', 'canceled')
   OR "stripe_subscription_id" IS NOT NULL;
