ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "tournament" text;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "tags" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "team_names_locked" boolean NOT NULL DEFAULT false;
