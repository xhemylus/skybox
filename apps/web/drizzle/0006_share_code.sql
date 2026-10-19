ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "share_code" text;

-- Backfill from UUID hex (stable, unique)
UPDATE "matches"
SET "share_code" = substr(replace("id"::text, '-', ''), 1, 8)
WHERE "share_code" IS NULL;

ALTER TABLE "matches" ALTER COLUMN "share_code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "matches_share_code_uidx" ON "matches" ("share_code");
