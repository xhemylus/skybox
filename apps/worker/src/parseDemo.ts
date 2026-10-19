import zlib from "node:zlib";
import {
  FLAG_C4,
  FLAG_DEFUSER,
  FLAG_HELMET,
  RADARS,
  RADAR_SIZE,
  MIN_DEMO_BYTES,
  classifyBuyType,
  cleanTeamName,
  guessTeamsFromFilename,
  isGenericTeamName,
  isPistolRound,
  normalizeMapName,
  pickClanName,
  type PlayerMatchStats,
  type PlayerTrack,
  type ReplayData,
  type ReplayGrenadePath,
  type ReplayKill,
  type ReplayPlayer,
  type ReplayRound,
  type ReplayUtil,
  type Side,
  type TeamKey,
  type UtilType,
} from "@skybox/shared";

type DemoSrc = string | Buffer;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const parser = require("@laihoe/demoparser2") as {
  parseHeader: (d: DemoSrc) => Record<string, string>;
  parseEvent: (
    d: DemoSrc,
    name: string,
    playerExtra?: string[] | null,
    otherExtra?: string[] | null,
  ) => Row[];
  parseEvents: (
    d: DemoSrc,
    names?: string[] | null,
    playerExtra?: string[] | null,
    otherExtra?: string[] | null,
  ) => unknown;
  parseTicks: (d: DemoSrc, props: string[], ticks?: number[] | null) => Row[];
  parseGrenades: (
    d: DemoSrc,
    extra?: string[] | null,
    grenades?: boolean | null,
  ) => Row[];
};

type Row = Record<string, unknown>;

/**
 * Sample every N ticks (~64/N Hz). Higher = less RAM/CPU (VPS-friendly).
 * Override with PARSE_SAMPLE_STEP (4–32). Default 16 ≈ 4 Hz.
 */
const SAMPLE_STEP = Math.max(
  4,
  Math.min(32, Number(process.env.PARSE_SAMPLE_STEP ?? "16") || 16),
);

const EVENT_NAMES = [
  "round_start",
  "round_freeze_end",
  "round_end",
  "round_announce_match_start",
  "player_death",
  "player_hurt",
  "bomb_planted",
  "bomb_defused",
  "bomb_exploded",
  "smokegrenade_expired",
  "inferno_expire",
  "smokegrenade_detonate",
  "inferno_startburn",
  "flashbang_detonate",
  "hegrenade_detonate",
] as const;

const PATH_STEP = 2;
const TRADE_WINDOW_SECONDS = 5;

const TICK_PROPS = [
  "X",
  "Y",
  "Z",
  "yaw",
  "health",
  "armor_value",
  "has_helmet",
  "has_defuser",
  "balance",
  "active_weapon_name",
  "inventory",
  "is_alive",
  "team_num",
  "team_clan_name",
  "current_equip_value",
];

const PROJECTILES: Record<string, UtilType> = {
  CSmokeGrenadeProjectile: "smoke",
  CFlashbangProjectile: "flash",
  CHEGrenadeProjectile: "he",
  CMolotovProjectile: "molotov",
  CDecoyProjectile: "decoy",
};

const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown) => (v == null ? "" : String(v));
const sideOfTeamNum = (v: unknown): Side | null =>
  num(v) === 3 ? "CT" : num(v) === 2 ? "T" : null;

/** Normalize parseEvents output (object map or flat rows with event_name). */
function groupEvents(raw: unknown): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const name = str((row as Row).event_name || (row as Row).event);
      if (!name) continue;
      (out[name] ??= []).push(row as Row);
    }
    return out;
  }
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(value)) out[key] = value as Row[];
    }
  }
  return out;
}

/** Team A starts CT regulation H1; flips each half. OT MR3 halves continue from H2 (A=T). */
function defaultSidesForRound(roundNumber: number): Record<TeamKey, Side> {
  if (roundNumber <= 12) return { A: "CT", B: "T" };
  if (roundNumber <= 24) return { A: "T", B: "CT" };
  const otHalf = Math.floor((roundNumber - 25) / 3);
  return otHalf % 2 === 0 ? { A: "T", B: "CT" } : { A: "CT", B: "T" };
}

/** Accepts raw .dem, .dem.zst and .dem.gz buffers. */
export function decompressDemo(buf: Buffer): Buffer {
  if (buf.subarray(0, 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))) {
    return zlib.zstdDecompressSync(buf);
  }
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    return zlib.gunzipSync(buf);
  }
  return buf;
}

export type ParseProgressFn = (pct: number, stage: string) => void;

export function parseDemo(
  input: DemoSrc,
  opts?: { filename?: string | null; onProgress?: ParseProgressFn },
): ReplayData {
  const report = (pct: number, stage: string) => {
    try {
      opts?.onProgress?.(Math.max(0, Math.min(100, Math.round(pct))), stage);
    } catch {
      /* ignore progress errors */
    }
  };

  let demo: DemoSrc;
  if (typeof input === "string") {
    // Path on disk — demoparser2 reads from file (no second copy in JS heap).
    demo = input;
    report(8, "Lecture fichier…");
  } else {
    if (!input?.length || input.length < MIN_DEMO_BYTES) {
      throw new Error("Fichier trop petit pour être une démo CS2 complète.");
    }
    report(8, "Décompression…");
    try {
      demo = decompressDemo(input);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "decompress failed";
      throw new Error(`Impossible de décompresser la démo (${detail}).`);
    }
    if (demo.length < MIN_DEMO_BYTES) {
      throw new Error("Fichier trop petit pour être une démo CS2 complète.");
    }
    const magic = demo.subarray(0, 8).toString("latin1");
    if (!magic.startsWith("PBDEMS2")) {
      throw new Error(`Not a CS2 demo (magic=${JSON.stringify(magic)})`);
    }
  }

  const t0 = Date.now();
  report(12, "Lecture de l'en-tête…");
  const header = parser.parseHeader(demo);
  const map = normalizeMapName(str(header.map_name));
  const tickRate = 64;

  // One pass for all events (each parseEvent() re-reads the whole demo).
  report(18, "Analyse des events…");
  let events = groupEvents(
    parser.parseEvents(demo, [...EVENT_NAMES], ["X", "Y", "Z"], []),
  );
  if (!(events.round_end?.length)) {
    console.warn("[parseDemo] parseEvents empty — fallback parseEvent per type");
    events = {};
    for (const name of EVENT_NAMES) {
      events[name] = parser.parseEvent(demo, name, ["X", "Y", "Z"], []) ?? [];
    }
  }
  const ev = (name: string) => events[name] ?? [];
  report(42, "Events OK");
  console.log(
    `[parseDemo] events ${((Date.now() - t0) / 1000).toFixed(1)}s map=${map} round_end=${ev("round_end").length}`,
  );

  const roundStarts = ev("round_start").map((e) => num(e.tick));
  const freezeEnds = ev("round_freeze_end").map((e) => num(e.tick));
  const roundEnds = ev("round_end").filter((e) => e.winner != null);
  const matchStarts = ev("round_announce_match_start").map((e) => num(e.tick));
  // Prefer the last match-start announcement (warmup / knife often fire earlier ones).
  const matchStart = matchStarts.length ? Math.max(...matchStarts) : 0;

  // ---- Round boundaries (drops warmup / knife rounds before the last match start) ----
  type RoundBounds = {
    startTick: number;
    freezeEndTick: number;
    endTick: number;
    nextStartTick: number;
    winnerSide: Side | null;
    reason: string | null;
  };
  const MAX_LIVE_TICKS = 3 * 60 * tickRate; // >3 min live ⇒ warmup / knife amalgam
  const allBounds: RoundBounds[] = [];
  let prevEnd = Math.max(
    -1,
    ...roundEnds.map((e) => num(e.tick)).filter((t) => t <= matchStart),
  );
  for (const e of roundEnds) {
    const endTick = num(e.tick);
    if (endTick <= matchStart) continue;
    const freezeEndTick =
      freezeEnds.find((t) => t > prevEnd && t <= endTick) ?? prevEnd + 1;
    const startCandidates = roundStarts.filter((t) => t > prevEnd && t <= freezeEndTick);
    let startTick = startCandidates.length
      ? Math.max(...startCandidates)
      : freezeEndTick - 15 * tickRate;
    startTick = Math.max(startTick, freezeEndTick - 20 * tickRate, prevEnd + 1, 0);
    allBounds.push({
      startTick,
      freezeEndTick,
      endTick,
      nextStartTick: endTick + 5 * tickRate,
      winnerSide: str(e.winner) === "CT" ? "CT" : str(e.winner) === "T" ? "T" : null,
      reason: e.reason == null ? null : str(e.reason),
    });
    prevEnd = endTick;
  }
  for (let i = 0; i < allBounds.length - 1; i++) {
    allBounds[i].nextStartTick = allBounds[i + 1].startTick;
  }

  // Drop leading amalgam rounds (warmup/knife) that swallow thousands of ticks / kills.
  const deaths = ev("player_death");
  let firstReal = allBounds.findIndex((b) => {
    const live = b.endTick - b.freezeEndTick;
    if (live <= 0 || live > MAX_LIVE_TICKS) return false;
    const kills = deaths.filter(
      (d) => num(d.tick) >= b.startTick && num(d.tick) < b.nextStartTick,
    ).length;
    return kills <= 15;
  });
  if (firstReal < 0) firstReal = 0;
  const bounds = allBounds.slice(firstReal);
  if (!bounds.length) throw new Error("No rounds found in demo");

  // ---- Player ticks ----
  report(48, "Positions joueurs…");
  const t1 = Date.now();
  const wantedTicks: number[] = [];
  for (const b of bounds) {
    for (let t = b.startTick; t < b.nextStartTick; t += SAMPLE_STEP) wantedTicks.push(t);
  }
  let tickRows = parser.parseTicks(demo, TICK_PROPS, wantedTicks) as Row[];
  report(72, "Positions OK");
  console.log(
    `[parseDemo] ticks ${((Date.now() - t1) / 1000).toFixed(1)}s samples=${wantedTicks.length} step=${SAMPLE_STEP}`,
  );
  wantedTicks.length = 0;
  const rowsByTick = new Map<number, Row[]>();
  for (const r of tickRows) {
    if (!sideOfTeamNum(r.team_num)) continue;
    const t = num(r.tick);
    let list = rowsByTick.get(t);
    if (!list) rowsByTick.set(t, (list = []));
    list.push(r);
  }

  // ---- Teams (clan majority across freezes → filename → defaults) ----
  const firstFreezeRows =
    rowsByTick.get(nearestSample(bounds[0], bounds[0].freezeEndTick)) ??
    tickRows.filter((r) => sideOfTeamNum(r.team_num));

  const clanVotes: Record<Side, string[]> = { CT: [], T: [] };
  for (const b of bounds.slice(0, Math.min(bounds.length, 12))) {
    const rows =
      rowsByTick.get(nearestSample(b, b.freezeEndTick)) ??
      rowsByTick.get(nearestSample(b, b.startTick)) ??
      [];
    for (const r of rows) {
      const side = sideOfTeamNum(r.team_num);
      const clan = str(r.team_clan_name);
      if (side && clan) clanVotes[side].push(clan);
    }
  }
  // Fallback: sample all tick rows lightly
  if (!clanVotes.CT.length || !clanVotes.T.length) {
    for (const r of tickRows) {
      const side = sideOfTeamNum(r.team_num);
      const clan = str(r.team_clan_name);
      if (side && clan) clanVotes[side].push(clan);
    }
  }
  // Drop dense array — Map is enough for the rest of the parse.
  tickRows = [];

  const clanOfSide: Partial<Record<Side, string>> = {
    CT: pickClanName(clanVotes.CT) ?? undefined,
    T: pickClanName(clanVotes.T) ?? undefined,
  };
  const useClans =
    Boolean(clanOfSide.CT && clanOfSide.T) &&
    clanOfSide.CT!.toLowerCase() !== clanOfSide.T!.toLowerCase();

  const fromFile = guessTeamsFromFilename(opts?.filename);
  const nameA = useClans
    ? clanOfSide.CT!
    : fromFile && !isGenericTeamName(fromFile.a)
      ? fromFile.a
      : "Team Alpha";
  const nameB = useClans
    ? clanOfSide.T!
    : fromFile && !isGenericTeamName(fromFile.b)
      ? fromFile.b
      : "Team Bravo";

  const players: ReplayPlayer[] = [];
  const playerIdx = new Map<string, number>();
  const teamOfFirstSeen = (r: Row): TeamKey => {
    if (useClans) {
      const clan = cleanTeamName(str(r.team_clan_name));
      if (clan && !isGenericTeamName(clan)) {
        if (clanOfSide.CT && clan.toLowerCase() === clanOfSide.CT.toLowerCase()) return "A";
        if (clanOfSide.T && clan.toLowerCase() === clanOfSide.T.toLowerCase()) return "B";
      }
    }
    return sideOfTeamNum(r.team_num) === "CT" ? "A" : "B";
  };
  // Prefer the round-1 freeze rows so team A = team starting CT
  for (const r of [...firstFreezeRows, ...tickRows]) {
    const id = str(r.steamid);
    if (!id || id === "0" || playerIdx.has(id) || !sideOfTeamNum(r.team_num)) continue;
    playerIdx.set(id, players.length);
    players.push({ steamId: id, name: str(r.name) || id, team: teamOfFirstSeen(r) });
  }
  const pIdx = (steamId: unknown) => {
    const i = playerIdx.get(str(steamId));
    return i == null ? null : i;
  };

  const teams: ReplayData["teams"] = [
    { key: "A", name: nameA },
    { key: "B", name: nameB },
  ];

  // ---- String tables ----
  const weapons: string[] = [];
  const weaponIdx = new Map<string, number>();
  const weaponId = (w: string) => {
    let i = weaponIdx.get(w);
    if (i == null) {
      i = weapons.length;
      weapons.push(w);
      weaponIdx.set(w, i);
    }
    return i;
  };
  const inventories: string[][] = [];
  const invIdx = new Map<string, number>();
  const invId = (inv: unknown) => {
    const list = Array.isArray(inv) ? inv.map(str) : [];
    const key = list.join("|");
    let i = invIdx.get(key);
    if (i == null) {
      i = inventories.length;
      inventories.push(list);
      invIdx.set(key, i);
    }
    return i;
  };

  // ---- Events (already batched) ----
  const hurts = ev("player_hurt");
  const plants = ev("bomb_planted");
  const defuses = ev("bomb_defused").map((e) => num(e.tick));
  const explodes = ev("bomb_exploded").map((e) => num(e.tick));
  const smokeEnd = new Map(ev("smokegrenade_expired").map((e) => [num(e.entityid), num(e.tick)]));
  const fireEnd = new Map(ev("inferno_expire").map((e) => [num(e.entityid), num(e.tick)]));
  const utilEvents: { type: UtilType; rows: Row[]; end: (r: Row) => number }[] = [
    {
      type: "smoke",
      rows: ev("smokegrenade_detonate"),
      end: (r) => smokeEnd.get(num(r.entityid)) ?? num(r.tick) + 20 * tickRate,
    },
    {
      type: "molotov",
      rows: ev("inferno_startburn"),
      end: (r) => fireEnd.get(num(r.entityid)) ?? num(r.tick) + 7 * tickRate,
    },
    { type: "flash", rows: ev("flashbang_detonate"), end: (r) => num(r.tick) + tickRate / 2 },
    { type: "he", rows: ev("hegrenade_detonate"), end: (r) => num(r.tick) + tickRate / 2 },
  ];

  report(76, "Trajectoires util…");
  const t2 = Date.now();
  // false = projectiles only (faster / less memory)
  let grenadeRows = parser.parseGrenades(demo, null, false) as Row[];
  report(82, "Util OK");
  console.log(`[parseDemo] grenades ${((Date.now() - t2) / 1000).toFixed(1)}s`);

  // ---- Build rounds ----
  report(85, "Construction du replay…");
  const rounds: ReplayRound[] = [];
  let scoreA = 0;
  let scoreB = 0;

  bounds.forEach((b, ri) => {
    const number = ri + 1;
    const inRound = (t: number) => t >= b.startTick && t < b.nextStartTick;
    const samples = Math.ceil((b.nextStartTick - b.startTick) / SAMPLE_STEP);

    const tracks: PlayerTrack[] = players.map(() => ({
      x: new Array(samples).fill(0),
      y: new Array(samples).fill(0),
      z: new Array(samples).fill(0),
      yaw: new Array(samples).fill(0),
      hp: new Array(samples).fill(-1),
      armor: new Array(samples).fill(0),
      money: new Array(samples).fill(0),
      weapon: new Array(samples).fill(0),
      inv: new Array(samples).fill(0),
      flags: new Array(samples).fill(0),
    }));
    const seen = new Array(players.length).fill(false);

    for (let s = 0; s < samples; s++) {
      const rows = rowsByTick.get(b.startTick + s * SAMPLE_STEP) ?? [];
      const present = new Set<number>();
      for (const r of rows) {
        const i = pIdx(r.steamid);
        if (i == null) continue;
        present.add(i);
        seen[i] = true;
        const tr = tracks[i];
        const inv = Array.isArray(r.inventory) ? (r.inventory as unknown[]).map(str) : [];
        tr.x[s] = Math.round(num(r.X));
        tr.y[s] = Math.round(num(r.Y));
        tr.z[s] = Math.round(num(r.Z));
        tr.yaw[s] = Math.round(num(r.yaw));
        tr.hp[s] = r.is_alive === false ? 0 : Math.max(0, num(r.health));
        tr.armor[s] = num(r.armor_value);
        tr.money[s] = num(r.balance);
        tr.weapon[s] = weaponId(str(r.active_weapon_name));
        tr.inv[s] = invId(inv);
        tr.flags[s] =
          (r.has_helmet ? FLAG_HELMET : 0) |
          (r.has_defuser ? FLAG_DEFUSER : 0) |
          (inv.some((w) => w.startsWith("C4")) ? FLAG_C4 : 0);
      }
      // carry forward players missing from this sample (lag / disconnect)
      if (s > 0) {
        for (let i = 0; i < players.length; i++) {
          if (present.has(i) || tracks[i].hp[s - 1] < 0) continue;
          const tr = tracks[i];
          for (const k of Object.keys(tr) as (keyof PlayerTrack)[]) tr[k][s] = tr[k][s - 1];
        }
      }
    }

    // Sides for this round — prefer live team_num; fallback by half (incl. OT MR3)
    const sideRows = rowsByTick.get(nearestSample(b, b.freezeEndTick)) ?? [];
    const sideOf: Record<TeamKey, Side> = defaultSidesForRound(number);
    for (const r of sideRows) {
      const i = pIdx(r.steamid);
      const side = sideOfTeamNum(r.team_num);
      if (i == null || !side) continue;
      const team = players[i].team;
      sideOf[team] = side;
      sideOf[team === "A" ? "B" : "A"] = side === "CT" ? "T" : "CT";
      break;
    }

    // Economy at freeze end + 3s
    const equipRows = rowsByTick.get(nearestSample(b, b.freezeEndTick + 3 * tickRate)) ?? sideRows;
    const equip: Record<TeamKey, number> = { A: 0, B: 0 };
    const count: Record<TeamKey, number> = { A: 0, B: 0 };
    for (const r of equipRows) {
      const i = pIdx(r.steamid);
      if (i == null) continue;
      equip[players[i].team] += num(r.current_equip_value);
      count[players[i].team] += 1;
    }
    for (const k of ["A", "B"] as TeamKey[]) {
      equip[k] = count[k] ? Math.round(equip[k] / count[k]) : 0;
    }

    const winnerTeam: TeamKey | null = b.winnerSide
      ? sideOf.A === b.winnerSide
        ? "A"
        : "B"
      : null;
    if (winnerTeam === "A") scoreA++;
    if (winnerTeam === "B") scoreB++;

    const kills: ReplayKill[] = deaths
      .filter((d) => inRound(num(d.tick)))
      .flatMap((d) => {
        const victim = pIdx(d.user_steamid);
        if (victim == null) return [];
        return [
          {
            tick: num(d.tick),
            attacker: pIdx(d.attacker_steamid),
            victim,
            assister: pIdx(d.assister_steamid),
            weapon: str(d.weapon),
            headshot: Boolean(d.headshot),
            wallbang: num(d.penetrated) > 0,
            throughSmoke: Boolean(d.thrusmoke),
            noscope: Boolean(d.noscope),
            attackerBlind: Boolean(d.attackerblind),
            flashAssist: Boolean(d.assistedflash),
            victimX: Math.round(num(d.user_X)),
            victimY: Math.round(num(d.user_Y)),
            victimZ: Math.round(num(d.user_Z)),
            attackerX: d.attacker_X == null ? null : Math.round(num(d.attacker_X)),
            attackerY: d.attacker_Y == null ? null : Math.round(num(d.attacker_Y)),
          },
        ];
      });

    const util: ReplayUtil[] = utilEvents.flatMap(({ type, rows, end }) =>
      rows
        .filter((r) => inRound(num(r.tick)))
        .map((r) => ({
          type,
          thrower: pIdx(r.user_steamid),
          startTick: num(r.tick),
          endTick: Math.min(end(r), b.nextStartTick),
          x: Math.round(num(r.x)),
          y: Math.round(num(r.y)),
          z: Math.round(num(r.z)),
        })),
    );

    const plant = plants.find((p) => inRound(num(p.tick)));
    const plantTick = plant ? num(plant.tick) : null;
    rounds.push({
      number,
      startTick: b.startTick,
      freezeEndTick: b.freezeEndTick,
      endTick: b.endTick,
      nextStartTick: b.nextStartTick,
      winnerSide: b.winnerSide,
      winnerTeam,
      reason: b.reason,
      sideOf,
      scoreA,
      scoreB,
      buy: {
        A: classifyBuyType(equip.A, isPistolRound(number)),
        B: classifyBuyType(equip.B, isPistolRound(number)),
      },
      equip,
      bomb: {
        plantTick,
        plantX: plant ? Math.round(num(plant.user_X)) : null,
        plantY: plant ? Math.round(num(plant.user_Y)) : null,
        site: plant ? bombSite(map, num(plant.user_X), num(plant.user_Y)) : null,
        planter: plant ? pIdx(plant.user_steamid) : null,
        defuseTick: defuses.find((t) => inRound(t)) ?? null,
        explodeTick: explodes.find((t) => inRound(t)) ?? null,
      },
      sampleStart: b.startTick,
      samples,
      tracks: tracks.map((t, i) => (seen[i] ? t : emptyTrack())),
      kills,
      util,
      paths: [],
    });
  });

  attachGrenadePaths(grenadeRows, rounds, pIdx);
  grenadeRows = [];

  const stats = computeStats(players, rounds, hurts, pIdx, tickRate);

  if (!players.length) throw new Error("Aucun joueur trouvé dans la démo.");
  if (!rounds.length) throw new Error("No rounds found in demo");
  if (rounds.every((r) => r.samples === 0)) {
    throw new Error("Démo parsée mais sans positions joueurs (fichier corrompu ?).");
  }

  report(92, "Replay prêt");
  console.log(
    `[parseDemo] done ${((Date.now() - t0) / 1000).toFixed(1)}s rounds=${rounds.length} players=${players.length}`,
  );

  return {
    version: 2,
    map,
    tickRate,
    sampleStep: SAMPLE_STEP,
    teams,
    players,
    weapons,
    inventories,
    rounds,
    stats,
  };
}

function nearestSample(b: { startTick: number; nextStartTick: number }, tick: number) {
  const clamped = Math.min(Math.max(tick, b.startTick), b.nextStartTick - 1);
  return b.startTick + Math.round((clamped - b.startTick) / SAMPLE_STEP) * SAMPLE_STEP;
}

function emptyTrack(): PlayerTrack {
  return { x: [], y: [], z: [], yaw: [], hp: [], armor: [], money: [], weapon: [], inv: [], flags: [] };
}

function bombSite(map: string, x: number, y: number): "A" | "B" | null {
  const info = RADARS[map];
  if (!info?.bombA || !info.bombB) return null;
  const px = (x - info.posX) / info.scale / RADAR_SIZE;
  const py = (info.posY - y) / info.scale / RADAR_SIZE;
  const dA = Math.hypot(px - info.bombA[0], py - info.bombA[1]);
  const dB = Math.hypot(px - info.bombB[0], py - info.bombB[1]);
  return dA <= dB ? "A" : "B";
}

function attachGrenadePaths(
  rows: Row[],
  rounds: ReplayRound[],
  pIdx: (s: unknown) => number | null,
) {
  type Acc = { type: UtilType; steamid: unknown; points: { t: number; x: number; y: number }[] };
  const open = new Map<number, Acc>();
  const done: Acc[] = [];
  const sorted = rows
    .filter((r) => PROJECTILES[str(r.grenade_type)] && r.x != null && r.y != null)
    .sort((a, b) => num(a.tick) - num(b.tick));

  for (const r of sorted) {
    const id = num(r.grenade_entity_id);
    const t = num(r.tick);
    let acc = open.get(id);
    const last = acc?.points[acc.points.length - 1];
    if (!acc || !last || t - last.t > 32) {
      if (acc) done.push(acc);
      acc = { type: PROJECTILES[str(r.grenade_type)], steamid: r.steamid, points: [] };
      open.set(id, acc);
    }
    if (!last || t - last.t >= PATH_STEP || acc.points.length === 0) {
      acc.points.push({ t, x: Math.round(num(r.x)), y: Math.round(num(r.y)) });
    }
  }
  done.push(...open.values());

  for (const acc of done) {
    if (acc.points.length < 2) continue;
    const start = acc.points[0].t;
    const round = rounds.find((r) => start >= r.startTick && start < r.nextStartTick);
    if (!round) continue;
    // resample to a fixed step so the client can index by tick
    const xs: number[] = [];
    const ys: number[] = [];
    let j = 0;
    const end = acc.points[acc.points.length - 1].t;
    for (let t = start; t <= end; t += PATH_STEP) {
      while (j < acc.points.length - 1 && acc.points[j + 1].t <= t) j++;
      xs.push(acc.points[j].x);
      ys.push(acc.points[j].y);
    }
    const path: ReplayGrenadePath = {
      type: acc.type,
      thrower: pIdx(acc.steamid),
      startTick: start,
      step: PATH_STEP,
      xs,
      ys,
    };
    round.paths.push(path);
  }
}

function computeStats(
  players: ReplayPlayer[],
  rounds: ReplayRound[],
  hurts: Row[],
  pIdx: (s: unknown) => number | null,
  tickRate: number,
): PlayerMatchStats[] {
  const stats: PlayerMatchStats[] = players.map((p) => ({
    steamId: p.steamId,
    name: p.name,
    team: p.team,
    kills: 0,
    deaths: 0,
    assists: 0,
    adr: 0,
    kast: 0,
    headshotPct: 0,
    utilDamage: 0,
    firstKills: 0,
    firstDeaths: 0,
    flashAssists: 0,
  }));
  const damage = new Array(players.length).fill(0);
  const hs = new Array(players.length).fill(0);
  const kastRounds = new Array(players.length).fill(0);
  const tradeWindow = TRADE_WINDOW_SECONDS * tickRate;

  for (const round of rounds) {
    const kast = new Array(players.length).fill(false);
    const died = new Array(players.length).fill(false);
    const hp = new Array(players.length).fill(100);

    round.kills.forEach((k, idx) => {
      const victimTeam = players[k.victim].team;
      const teamKill = k.attacker != null && players[k.attacker].team === victimTeam;
      stats[k.victim].deaths++;
      died[k.victim] = true;
      if (k.attacker != null && !teamKill && k.attacker !== k.victim) {
        stats[k.attacker].kills++;
        kast[k.attacker] = true;
        if (k.headshot) hs[k.attacker]++;
        if (idx === 0) {
          stats[k.attacker].firstKills++;
          stats[k.victim].firstDeaths++;
        }
      }
      if (k.assister != null && players[k.assister].team !== victimTeam) {
        stats[k.assister].assists++;
        kast[k.assister] = true;
        if (k.flashAssist) stats[k.assister].flashAssists++;
      }
      // traded: the victim's killer dies to the victim's team within the window
      if (k.attacker != null && !teamKill) {
        const traded = round.kills.some(
          (o) =>
            o.victim === k.attacker &&
            o.tick > k.tick &&
            o.tick - k.tick <= tradeWindow &&
            o.attacker != null &&
            players[o.attacker].team === victimTeam,
        );
        if (traded) kast[k.victim] = true;
      }
    });

    for (const h of hurts) {
      const t = num(h.tick);
      if (t < round.freezeEndTick || t >= round.nextStartTick) continue;
      const victim = pIdx(h.user_steamid);
      const attacker = pIdx(h.attacker_steamid);
      if (victim == null) continue;
      const before = hp[victim];
      hp[victim] = Math.max(0, num(h.health));
      if (attacker == null || players[attacker].team === players[victim].team) continue;
      const dealt = Math.min(num(h.dmg_health), before);
      damage[attacker] += dealt;
      const w = str(h.weapon).toLowerCase();
      if (w.includes("hegrenade") || w.includes("inferno") || w.includes("molotov") || w.includes("incgrenade")) {
        stats[attacker].utilDamage += dealt;
      }
    }

    for (let i = 0; i < players.length; i++) {
      if (round.tracks[i].hp.length === 0) continue;
      if (!died[i]) kast[i] = true;
      if (kast[i]) kastRounds[i]++;
    }
  }

  const n = Math.max(rounds.length, 1);
  return stats.map((s, i) => ({
    ...s,
    adr: Math.round((damage[i] / n) * 10) / 10,
    kast: Math.round((kastRounds[i] / n) * 1000) / 10,
    headshotPct: s.kills ? Math.round((hs[i] / s.kills) * 1000) / 10 : 0,
  }));
}
