CREATE TABLE IF NOT EXISTS "round_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "round_number" integer NOT NULL,
  "body" text NOT NULL DEFAULT '',
  "author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "round_notes_match_round_uidx"
  ON "round_notes" ("match_id", "round_number");
