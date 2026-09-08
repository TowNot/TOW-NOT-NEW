-- AlterTable
-- Existing subscribers had no category prefs; default conservatively so
-- Incidents/Police stay off until the client syncs Live Desk toggles.
ALTER TABLE "sms_subscribers" ADD COLUMN "alert_accidents" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "sms_subscribers" ADD COLUMN "alert_incidents" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sms_subscribers" ADD COLUMN "alert_police" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sms_subscribers" ADD COLUMN "alert_fire" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "sms_subscribers" ADD COLUMN "alert_waze" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "sms_subscribers" ADD COLUMN "alert_google_maps" BOOLEAN NOT NULL DEFAULT true;
