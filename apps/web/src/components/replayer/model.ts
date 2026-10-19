import {
  FLAG_C4,
  FLAG_DEFUSER,
  FLAG_HELMET,
  type BuyType,
  type ReplayData,
  type ReplayRound,
  type Side,
  type TeamKey,
} from "@skybox/shared";

export const SIDE_COLOR: Record<Side, string> = { CT: "#7aa3c7", T: "#d0a56a" };
export const ROUND_TIME_S = 115;
export const BOMB_TIME_S = 40;
export const SPEEDS = [0.5, 1, 2, 4, 8];

export type PlayerState = {
  idx: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  armor: number;
  money: number;
  weapon: string;
  inventory: string[];
  helmet: boolean;
  defuser: boolean;
  c4: boolean;
  alive: boolean;
};

export type Settings = {
  showNames: boolean;
  showTrails: boolean;
  showKills: boolean;
  colorRadar: boolean;
  autoNext: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  showNames: true,
  showTrails: true,
  showKills: true,
  colorRadar: false,
  autoNext: true,
};

export type RoundFilter = {
  /** Team whose side / buy / result the filters apply to */
  team: TeamKey;
  side: Side | "";
  buy: BuyType | "";
  oppBuy: BuyType | "";
  result: "win" | "loss" | "";
  site: "A" | "B" | "";
};

export const EMPTY_FILTER: RoundFilter = {
  team: "A",
  side: "",
  buy: "",
  oppBuy: "",
  result: "",
  site: "",
};

export const FILTER_PRESETS: { label: string; patch: Partial<RoundFilter> }[] = [
  { label: "Pistols CT", patch: { buy: "pistol", side: "CT", oppBuy: "", result: "", site: "" } },
  { label: "Pistols T", patch: { buy: "pistol", side: "T", oppBuy: "", result: "", site: "" } },
  { label: "Full CT", patch: { buy: "full", side: "CT", oppBuy: "", result: "", site: "" } },
  { label: "Full T", patch: { buy: "full", side: "T", oppBuy: "", result: "", site: "" } },
  { label: "Force", patch: { buy: "force", side: "", oppBuy: "", result: "", site: "" } },
  { label: "Eco", patch: { buy: "eco", side: "", oppBuy: "", result: "", site: "" } },
];

export function filterActive(f: RoundFilter) {
  return Boolean(f.side || f.buy || f.oppBuy || f.result || f.site);
}

export function oppositeTeam(team: TeamKey): TeamKey {
  return team === "A" ? "B" : "A";
}

export function roundMatches(round: ReplayRound, f: RoundFilter) {
  // Side / buy always relative to the selected team for that round
  if (f.side && round.sideOf[f.team] !== f.side) return false;
  if (f.buy && round.buy[f.team] !== f.buy) return false;
  if (f.oppBuy && round.buy[oppositeTeam(f.team)] !== f.oppBuy) return false;
  if (f.result === "win" && round.winnerTeam !== f.team) return false;
  if (f.result === "loss" && (round.winnerTeam == null || round.winnerTeam === f.team)) return false;
  if (f.site && round.bomb.site !== f.site) return false;
  return true;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number) => a + ((((b - a + 540) % 360) - 180) * t);

export function playerStateAt(
  replay: ReplayData,
  round: ReplayRound,
  idx: number,
  tick: number,
): PlayerState | null {
  const tr = round.tracks[idx];
  if (!tr || tr.hp.length === 0) return null;
  const f = Math.min(Math.max((tick - round.sampleStart) / replay.sampleStep, 0), round.samples - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, round.samples - 1);
  const t = f - i0;
  if (tr.hp[i0] < 0) return null;
  const alive = tr.hp[i0] > 0;
  const blend = alive && tr.hp[i1] > 0 ? t : 0;
  const flags = tr.flags[i0];
  return {
    idx,
    x: lerp(tr.x[i0], tr.x[i1], blend),
    y: lerp(tr.y[i0], tr.y[i1], blend),
    z: lerp(tr.z[i0], tr.z[i1], blend),
    yaw: lerpAngle(tr.yaw[i0], tr.yaw[i1], blend),
    hp: tr.hp[i0],
    armor: tr.armor[i0],
    money: tr.money[i0],
    weapon: replay.weapons[tr.weapon[i0]] ?? "",
    inventory: replay.inventories[tr.inv[i0]] ?? [],
    helmet: (flags & FLAG_HELMET) !== 0,
    defuser: (flags & FLAG_DEFUSER) !== 0,
    c4: (flags & FLAG_C4) !== 0,
    alive,
  };
}

export type ClockPhase = "freeze" | "live" | "bomb" | "over";

export function roundClock(round: ReplayRound, tick: number, tickRate: number) {
  const at = Math.min(tick, round.endTick);
  let phase: ClockPhase;
  let seconds: number;
  if (at < round.freezeEndTick) {
    phase = "freeze";
    seconds = (round.freezeEndTick - at) / tickRate;
  } else if (round.bomb.plantTick != null && at >= round.bomb.plantTick) {
    phase = "bomb";
    seconds = BOMB_TIME_S - (at - round.bomb.plantTick) / tickRate;
  } else {
    phase = "live";
    seconds = ROUND_TIME_S - (at - round.freezeEndTick) / tickRate;
  }
  if (tick >= round.endTick) phase = "over";
  return { phase, text: formatClock(seconds) };
}

export function formatClock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Score shown in the team panel: before the round outcome, then after it. */
export function displayedScore(round: ReplayRound, team: TeamKey, tick: number) {
  const after = team === "A" ? round.scoreA : round.scoreB;
  return tick >= round.endTick || round.winnerTeam !== team ? after : after - 1;
}

export function shortWeapon(name: string) {
  if (!name) return "";
  if (/knife|bayonet|karambit|daggers/i.test(name)) return "Knife";
  if (name.startsWith("C4")) return "C4";
  return name
    .replace("High Explosive Grenade", "HE")
    .replace("Smoke Grenade", "Smoke")
    .replace("Incendiary Grenade", "Incendiary")
    .replace("Desert Eagle", "Deagle");
}

const KILL_WEAPONS: Record<string, string> = {
  ak47: "AK-47",
  m4a1: "M4A4",
  m4a1_silencer: "M4A1-S",
  awp: "AWP",
  deagle: "Deagle",
  revolver: "R8",
  usp_silencer: "USP-S",
  glock: "Glock",
  hkp2000: "P2000",
  p250: "P250",
  tec9: "Tec-9",
  fiveseven: "Five-SeveN",
  cz75a: "CZ75",
  elite: "Dualies",
  galilar: "Galil",
  famas: "FAMAS",
  sg556: "SG 553",
  aug: "AUG",
  ssg08: "Scout",
  g3sg1: "G3SG1",
  scar20: "SCAR-20",
  mac10: "MAC-10",
  mp9: "MP9",
  mp7: "MP7",
  mp5sd: "MP5-SD",
  ump45: "UMP-45",
  p90: "P90",
  bizon: "PP-Bizon",
  nova: "Nova",
  xm1014: "XM1014",
  mag7: "MAG-7",
  sawedoff: "Sawed-Off",
  negev: "Negev",
  m249: "M249",
  hegrenade: "HE",
  inferno: "Molotov",
  molotov: "Molotov",
  incgrenade: "Incendiary",
  flashbang: "Flash",
  smokegrenade: "Smoke",
  decoy: "Decoy",
  taser: "Zeus",
  world: "World",
  planted_c4: "C4",
};

export function killWeapon(raw: string) {
  if (!raw) return "World";
  if (raw.includes("knife") || raw === "bayonet") return "Knife";
  return KILL_WEAPONS[raw] ?? raw;
}

export type GrenadeKind = "smoke" | "flash" | "he" | "molotov" | "decoy";

export function grenadesOf(inventory: string[]): GrenadeKind[] {
  const out: GrenadeKind[] = [];
  for (const item of inventory) {
    if (item === "Smoke Grenade") out.push("smoke");
    else if (item === "Flashbang") out.push("flash");
    else if (item === "High Explosive Grenade") out.push("he");
    else if (item === "Molotov" || item === "Incendiary Grenade") out.push("molotov");
    else if (item === "Decoy Grenade") out.push("decoy");
  }
  return out;
}
