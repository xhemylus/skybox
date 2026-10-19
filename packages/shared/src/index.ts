import { z } from "zod";
import { RADARS, type RadarInfo } from "./maps.generated";
export {
  cleanTeamName,
  guessTeamsFromFilename,
  isGenericTeamName,
  pickClanName,
  titleCaseTeam,
} from "./teamNames";
export { MIN_DEMO_BYTES, humanizeParseError } from "./parseErrors";

export { RADARS, type RadarInfo };

/** Competitive / Active Duty maps with radar assets shipped in the app. */
export const SUPPORTED_MAPS = Object.keys(RADARS).sort();

export const MAP_LABELS: Record<string, string> = {
  de_ancient: "Ancient",
  de_anubis: "Anubis",
  de_cache: "Cache",
  de_dust2: "Dust II",
  de_inferno: "Inferno",
  de_mirage: "Mirage",
  de_nuke: "Nuke",
  de_overpass: "Overpass",
  de_train: "Train",
  de_vertigo: "Vertigo",
};

/** Strip workshop path / trailing variants → canonical map name when possible. */
export function normalizeMapName(raw: string | null | undefined): string {
  if (!raw) return "unknown";
  let map = raw.trim().replace(/\\/g, "/").replace(/^.*\//, "").toLowerCase();
  // workshop: de_cache_xxx / de_cache_cs2 → de_cache when we know the base
  for (const known of SUPPORTED_MAPS) {
    if (map === known || map.startsWith(`${known}_`) || map.startsWith(`${known}.`)) {
      return known;
    }
  }
  // dust2 without prefix
  if (map === "dust2" || map.startsWith("dust2_")) return "de_dust2";
  if (!map.startsWith("de_") && !map.startsWith("cs_") && !map.startsWith("ar_")) {
    const withDe = `de_${map}`;
    if (RADARS[withDe]) return withDe;
  }
  return map || "unknown";
}

export function isMapSupported(map: string | null | undefined): boolean {
  return Boolean(map && RADARS[normalizeMapName(map)]);
}

export function mapDisplayName(map: string | null | undefined): string {
  if (!map) return "—";
  const normalized = normalizeMapName(map);
  return MAP_LABELS[normalized] ?? normalized.replace(/^de_/, "").replace(/^./, (c) => c.toUpperCase());
}

export const TeamRole = z.enum(["admin", "coach", "manager", "player"]);
export type TeamRole = z.infer<typeof TeamRole>;

export const ParseStatus = z.enum(["pending", "processing", "ready", "failed"]);
export type ParseStatus = z.infer<typeof ParseStatus>;

export const BuyType = z.enum(["pistol", "eco", "force", "full", "unknown"]);
export type BuyType = z.infer<typeof BuyType>;

export type Side = "CT" | "T";
export type TeamKey = "A" | "B";

export type UtilType = "smoke" | "molotov" | "flash" | "he" | "decoy";

export const FLAG_HELMET = 1;
export const FLAG_DEFUSER = 2;
export const FLAG_C4 = 4;

export interface ReplayTeam {
  key: TeamKey;
  name: string;
}

export interface ReplayPlayer {
  steamId: string;
  name: string;
  team: TeamKey;
}

/** One sample every `sampleStep` ticks starting at `round.sampleStart`. `hp < 0` = not in game. */
export interface PlayerTrack {
  x: number[];
  y: number[];
  z: number[];
  yaw: number[];
  hp: number[];
  armor: number[];
  money: number[];
  /** index into `ReplayData.weapons` */
  weapon: number[];
  /** index into `ReplayData.inventories` */
  inv: number[];
  /** bitmask of FLAG_* */
  flags: number[];
}

export interface ReplayKill {
  tick: number;
  attacker: number | null;
  victim: number;
  assister: number | null;
  weapon: string;
  headshot: boolean;
  wallbang: boolean;
  throughSmoke: boolean;
  noscope: boolean;
  attackerBlind: boolean;
  flashAssist: boolean;
  victimX: number;
  victimY: number;
  victimZ: number;
  attackerX: number | null;
  attackerY: number | null;
}

export interface ReplayUtil {
  type: UtilType;
  thrower: number | null;
  startTick: number;
  endTick: number;
  x: number;
  y: number;
  z: number;
}

export interface ReplayGrenadePath {
  type: UtilType;
  thrower: number | null;
  startTick: number;
  /** sample spacing in ticks */
  step: number;
  xs: number[];
  ys: number[];
}

export interface ReplayBomb {
  plantTick: number | null;
  plantX: number | null;
  plantY: number | null;
  site: "A" | "B" | null;
  planter: number | null;
  defuseTick: number | null;
  explodeTick: number | null;
}

export interface ReplayRound {
  number: number;
  startTick: number;
  freezeEndTick: number;
  endTick: number;
  nextStartTick: number;
  winnerSide: Side | null;
  winnerTeam: TeamKey | null;
  reason: string | null;
  sideOf: Record<TeamKey, Side>;
  scoreA: number;
  scoreB: number;
  buy: Record<TeamKey, BuyType>;
  equip: Record<TeamKey, number>;
  bomb: ReplayBomb;
  sampleStart: number;
  samples: number;
  /** aligned with `ReplayData.players` */
  tracks: PlayerTrack[];
  kills: ReplayKill[];
  util: ReplayUtil[];
  paths: ReplayGrenadePath[];
}

export interface PlayerMatchStats {
  steamId: string;
  name: string;
  team: TeamKey;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  kast: number;
  headshotPct: number;
  utilDamage: number;
  firstKills: number;
  firstDeaths: number;
  flashAssists: number;
}

export interface ReplayData {
  version: 2;
  map: string;
  tickRate: number;
  sampleStep: number;
  teams: [ReplayTeam, ReplayTeam];
  players: ReplayPlayer[];
  weapons: string[];
  inventories: string[][];
  rounds: ReplayRound[];
  stats: PlayerMatchStats[];
}

export const PaintStrokeSchema = z.object({
  id: z.string().max(64),
  color: z.string().max(32),
  width: z.number().min(0.5).max(64),
  /** radar pixel coordinates (0..1024, lower level offset by +1024 on x) */
  points: z
    .array(z.object({ x: z.number().finite(), y: z.number().finite() }))
    .max(2000),
  tool: z.enum(["free", "line", "arrow", "circle"]).default("free"),
  round: z.number().int().nullable().default(null),
});

export const AnnotationsPayloadSchema = z.object({
  strokes: z.array(PaintStrokeSchema).max(200),
});

export type PaintStroke = z.infer<typeof PaintStrokeSchema>;
export type AnnotationsPayload = z.infer<typeof AnnotationsPayloadSchema>;

export const PARSE_QUEUE_NAME = "demo-parse";

export const ParseJobSchema = z.object({
  matchId: z.string().uuid(),
  teamId: z.string().uuid(),
  demoKey: z.string(),
});

export type ParseJob = z.infer<typeof ParseJobSchema>;

export const RADAR_SIZE = 1024;

/** World coordinates → radar pixel (0..1024). Lower-level positions are shifted by +RADAR_SIZE on x. */
export function worldToRadar(
  map: string,
  x: number,
  y: number,
  z = 0,
): { x: number; y: number; lower: boolean } {
  const info = RADARS[normalizeMapName(map)];
  if (!info) return { x: RADAR_SIZE / 2, y: RADAR_SIZE / 2, lower: false };
  const lower = info.lowerBelowZ != null && z < info.lowerBelowZ;
  return {
    x: (x - info.posX) / info.scale + (lower ? RADAR_SIZE : 0),
    y: (info.posY - y) / info.scale,
    lower,
  };
}

export function radarUnits(map: string, worldUnits: number) {
  return worldUnits / (RADARS[normalizeMapName(map)]?.scale ?? 5);
}

export function hasLowerLevel(map: string) {
  return RADARS[normalizeMapName(map)]?.lowerBelowZ != null;
}

export function classifyBuyType(avgEquipValue: number, isPistolRound: boolean): BuyType {
  if (isPistolRound) return "pistol";
  if (avgEquipValue < 1250) return "eco";
  if (avgEquipValue < 3750) return "force";
  return "full";
}

export function isPistolRound(roundNumber: number) {
  if (roundNumber === 1 || roundNumber === 13) return true;
  // OT MR3 halves: pistols at 25, 28, 31, 34…
  if (roundNumber > 24) return (roundNumber - 25) % 3 === 0;
  return false;
}

/** Halftime separators for MR12 with MR3 overtime halves. */
export function isHalfBoundary(roundNumber: number) {
  return roundNumber === 12 || (roundNumber > 24 && (roundNumber - 24) % 3 === 0);
}
