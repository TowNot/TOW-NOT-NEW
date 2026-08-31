-- Single active device session per account (session takeover on new login).
ALTER TABLE "user_preferences" ADD COLUMN "current_session_token" TEXT;
