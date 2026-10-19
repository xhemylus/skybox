-- Switch from email magic-links to Steam OpenID.

DROP TABLE IF EXISTS "magic_links";

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "steam_id" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;

-- Reset auth rows so every account is Steam-backed (local/dev safe).
DELETE FROM "sessions";
DELETE FROM "team_members";
DELETE FROM "invites";
DELETE FROM "users";

ALTER TABLE "users" ALTER COLUMN "steam_id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_steam_id_uidx" ON "users" ("steam_id");

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "steam_id" text;
ALTER TABLE "invites" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "invites" DROP COLUMN IF EXISTS "email";
