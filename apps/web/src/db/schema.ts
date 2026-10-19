import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  boolean,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const teamRoleEnum = pgEnum("team_role", [
  "admin",
  "coach",
  "manager",
  "player",
]);

export const parseStatusEnum = pgEnum("parse_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const buyTypeEnum = pgEnum("buy_type", [
  "pistol",
  "eco",
  "force",
  "full",
  "unknown",
]);

export const sideEnum = pgEnum("side", ["CT", "T"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    steamId: text("steam_id").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_steam_id_uidx").on(t.steamId)],
);

export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamRoleEnum("role").notNull().default("player"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("team_members_team_user").on(t.teamId, t.userId)],
);

export const invites = pgTable("invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  /** Optional whitelist: if set, only this SteamID may accept the invite. */
  steamId: text("steam_id"),
  role: teamRoleEnum("role").notNull().default("player"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    filename: text("filename").notNull(),
    /** Short public code for readable share links (/r/{code}/…). */
    shareCode: text("share_code").notNull(),
    /** SHA-256 of the uploaded file bytes — dedupe per team. */
    contentHash: text("content_hash"),
    demoKey: text("demo_key").notNull(),
    replayKey: text("replay_key"),
    mapName: text("map_name"),
    playedAt: timestamp("played_at", { withTimezone: true }),
    parseStatus: parseStatusEnum("parse_status").notNull().default("pending"),
    parseError: text("parse_error"),
    scoreA: integer("score_a"),
    scoreB: integer("score_b"),
    teamAName: text("team_a_name"),
    teamBName: text("team_b_name"),
    /** When true, reparse keeps manually set team names. */
    teamNamesLocked: boolean("team_names_locked").notNull().default(false),
    tournament: text("tournament"),
    tags: text("tags").array().notNull().default([]),
    notes: text("notes"),
    fileSizeBytes: integer("file_size_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("matches_team_content_hash").on(t.teamId, t.contentHash),
    uniqueIndex("matches_share_code_uidx").on(t.shareCode),
  ],
);

export const rounds = pgTable("rounds", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  startTick: integer("start_tick").notNull(),
  endTick: integer("end_tick").notNull(),
  winner: sideEnum("winner"),
  winnerTeam: text("winner_team"),
  reason: text("reason"),
  sideA: sideEnum("side_a").notNull().default("CT"),
  buyA: buyTypeEnum("buy_a").notNull().default("unknown"),
  buyB: buyTypeEnum("buy_b").notNull().default("unknown"),
  scoreA: integer("score_a").notNull().default(0),
  scoreB: integer("score_b").notNull().default(0),
  bombSite: text("bomb_site"),
});

export const playerMatchStats = pgTable("player_match_stats", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  steamId: text("steam_id").notNull(),
  name: text("name").notNull(),
  team: text("team").notNull().default("A"),
  kills: integer("kills").notNull().default(0),
  deaths: integer("deaths").notNull().default(0),
  assists: integer("assists").notNull().default(0),
  adr: real("adr").notNull().default(0),
  kast: real("kast").notNull().default(0),
  utilDamage: real("util_damage").notNull().default(0),
  headshotPct: real("headshot_pct").notNull().default(0),
  firstKills: integer("first_kills").notNull().default(0),
  firstDeaths: integer("first_deaths").notNull().default(0),
  flashAssists: integer("flash_assists").notNull().default(0),
});

export const annotations = pgTable("annotations", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" })
    .unique(),
  authorId: uuid("author_id").references(() => users.id, {
    onDelete: "set null",
  }),
  payload: jsonb("payload").notNull().$type<{ strokes: unknown[] }>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Coach/player review note scoped to a single round. */
export const roundNotes = pgTable(
  "round_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    roundNumber: integer("round_number").notNull(),
    body: text("body").notNull().default(""),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("round_notes_match_round_uidx").on(t.matchId, t.roundNumber)],
);

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type RoundNote = typeof roundNotes.$inferSelect;
