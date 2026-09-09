-- Existing accounts already use a city on the desk — treat them as chosen.
-- New session claims set city_chosen=false until /welcome save.
ALTER TABLE "user_preferences" ADD COLUMN "city_chosen" BOOLEAN NOT NULL DEFAULT true;
