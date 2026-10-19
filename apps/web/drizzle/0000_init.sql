CREATE TYPE "public"."team_role" AS ENUM('admin', 'coach', 'manager', 'player');
CREATE TYPE "public"."parse_status" AS ENUM('pending', 'processing', 'ready', 'failed');
CREATE TYPE "public"."buy_type" AS ENUM('pistol', 'eco', 'force', 'full', 'unknown');
CREATE TYPE "public"."side" AS ENUM('CT', 'T');

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "role" "team_role" DEFAULT 'player' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_user" ON "team_members" ("team_id","user_id");

CREATE TABLE IF NOT EXISTS "invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "email" text NOT NULL,
  "role" "team_role" DEFAULT 'player' NOT NULL,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "magic_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE cascade,
  "uploaded_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "filename" text NOT NULL,
  "demo_key" text NOT NULL,
  "replay_key" text,
  "map_name" text,
  "played_at" timestamp with time zone,
  "parse_status" "parse_status" DEFAULT 'pending' NOT NULL,
  "parse_error" text,
  "score_ct" integer,
  "score_t" integer,
  "team_ct_name" text,
  "team_t_name" text,
  "file_size_bytes" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "rounds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE cascade,
  "number" integer NOT NULL,
  "start_tick" integer NOT NULL,
  "end_tick" integer NOT NULL,
  "winner" "side",
  "reason" text,
  "buy_type_ct" "buy_type" DEFAULT 'unknown' NOT NULL,
  "buy_type_t" "buy_type" DEFAULT 'unknown' NOT NULL,
  "score_ct" integer DEFAULT 0 NOT NULL,
  "score_t" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "player_match_stats" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE cascade,
  "steam_id" text NOT NULL,
  "name" text NOT NULL,
  "side" "side" NOT NULL,
  "kills" integer DEFAULT 0 NOT NULL,
  "deaths" integer DEFAULT 0 NOT NULL,
  "assists" integer DEFAULT 0 NOT NULL,
  "adr" real DEFAULT 0 NOT NULL,
  "util_damage" real DEFAULT 0 NOT NULL,
  "headshot_pct" real DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "annotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL UNIQUE REFERENCES "matches"("id") ON DELETE cascade,
  "author_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "payload" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
