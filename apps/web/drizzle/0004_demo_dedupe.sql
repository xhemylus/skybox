ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "content_hash" text;

-- One identical demo file per team (null hashes from legacy rows allowed multiple times).
CREATE UNIQUE INDEX IF NOT EXISTS "matches_team_content_hash"
  ON "matches" ("team_id", "content_hash")
  WHERE "content_hash" IS NOT NULL;
