ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "parse_progress" integer NOT NULL DEFAULT 0;
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "parse_stage" text;
