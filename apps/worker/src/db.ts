import { drizzle } from "drizzle-orm/postgres-js";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import postgres from "postgres";
import { env } from "./env";

// Mirror of the tables the worker writes to (source of truth: apps/web/src/db/schema.ts)
const parseStatusEnum = pgEnum("parse_status", ["pending", "processing", "ready", "failed"]);
const buyTypeEnum = pgEnum("buy_type", ["pistol", "eco", "force", "full", "unknown"]);
const sideEnum = pgEnum("side", ["CT", "T"]);

export const matches = pgTable("matches", {
  id: uuid("id").primaryKey(),
  teamId: uuid("team_id").notNull(),
  filename: text("filename").notNull(),
  demoKey: text("demo_key").notNull(),
  replayKey: text("replay_key"),
  mapName: text("map_name"),
  parseStatus: parseStatusEnum("parse_status").notNull(),
  parseError: text("parse_error"),
  scoreA: integer("score_a"),
  scoreB: integer("score_b"),
  teamAName: text("team_a_name"),
  teamBName: text("team_b_name"),
  teamNamesLocked: boolean("team_names_locked").notNull().default(false),
  tournament: text("tournament"),
  tags: text("tags").array().notNull().default([]),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const rounds = pgTable("rounds", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").notNull(),
  number: integer("number").notNull(),
  startTick: integer("start_tick").notNull(),
  endTick: integer("end_tick").notNull(),
  winner: sideEnum("winner"),
  winnerTeam: text("winner_team"),
  reason: text("reason"),
  sideA: sideEnum("side_a").notNull(),
  buyA: buyTypeEnum("buy_a").notNull(),
  buyB: buyTypeEnum("buy_b").notNull(),
  scoreA: integer("score_a").notNull(),
  scoreB: integer("score_b").notNull(),
  bombSite: text("bomb_site"),
});

export const playerMatchStats = pgTable("player_match_stats", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").notNull(),
  steamId: text("steam_id").notNull(),
  name: text("name").notNull(),
  team: text("team").notNull(),
  kills: integer("kills").notNull(),
  deaths: integer("deaths").notNull(),
  assists: integer("assists").notNull(),
  adr: real("adr").notNull(),
  kast: real("kast").notNull(),
  utilDamage: real("util_damage").notNull(),
  headshotPct: real("headshot_pct").notNull(),
  firstKills: integer("first_kills").notNull(),
  firstDeaths: integer("first_deaths").notNull(),
  flashAssists: integer("flash_assists").notNull(),
});

const client = postgres(env.databaseUrl, { max: 5 });
export const db = drizzle(client);
