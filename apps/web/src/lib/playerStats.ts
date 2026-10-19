import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { matches, playerMatchStats, users } from "@/db/schema";
import { fetchSteamProfile } from "@/lib/steam";

export type PlayerMatchRow = {
  matchId: string;
  mapName: string | null;
  teamAName: string | null;
  teamBName: string | null;
  scoreA: number | null;
  scoreB: number | null;
  tournament: string | null;
  tags: string[] | null;
  createdAt: Date;
  team: string;
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
  name: string;
};

export type MapBreakdown = {
  mapName: string;
  matches: number;
  kills: number;
  deaths: number;
  adr: number;
  kast: number;
  wins: number;
};

export type PlayerProfile = {
  steamId: string;
  name: string;
  avatarUrl: string | null;
  matches: number;
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
  kd: number;
  rating: number;
  fkDiff: number;
  recent: PlayerMatchRow[];
  maps: MapBreakdown[];
};

/** Approximate HLTV-style composite from box-score averages (no per-round data). */
export function edgeRating(input: {
  kills: number;
  deaths: number;
  adr: number;
  kast: number;
  firstKills: number;
  firstDeaths: number;
  matches: number;
}): number {
  if (input.matches <= 0) return 0;
  // ~22 rounds / map MR12 average
  const rounds = input.matches * 22;
  const kpr = input.kills / rounds;
  const dpr = input.deaths / rounds;
  const impact =
    (input.firstKills * 2.13 +
      Math.max(0, input.kills - input.deaths) * 0.42 +
      Math.max(0, input.firstKills - input.firstDeaths) * 0.35) /
    rounds;
  const raw =
    0.0073 * input.kast +
    0.3591 * kpr -
    0.5329 * dpr +
    0.2372 * impact +
    0.0032 * input.adr +
    0.1587;
  return Math.round(raw * 100) / 100;
}

function wonMatch(row: PlayerMatchRow): boolean | null {
  if (row.scoreA == null || row.scoreB == null) return null;
  if (row.scoreA === row.scoreB) return null;
  const aWon = row.scoreA > row.scoreB;
  return row.team === "A" ? aWon : !aWon;
}

export async function loadPlayerProfile(
  teamId: string,
  steamId: string,
): Promise<PlayerProfile | null> {
  const rows = await db
    .select({
      matchId: matches.id,
      mapName: matches.mapName,
      teamAName: matches.teamAName,
      teamBName: matches.teamBName,
      scoreA: matches.scoreA,
      scoreB: matches.scoreB,
      tournament: matches.tournament,
      tags: matches.tags,
      createdAt: matches.createdAt,
      team: playerMatchStats.team,
      kills: playerMatchStats.kills,
      deaths: playerMatchStats.deaths,
      assists: playerMatchStats.assists,
      adr: playerMatchStats.adr,
      kast: playerMatchStats.kast,
      headshotPct: playerMatchStats.headshotPct,
      utilDamage: playerMatchStats.utilDamage,
      firstKills: playerMatchStats.firstKills,
      firstDeaths: playerMatchStats.firstDeaths,
      flashAssists: playerMatchStats.flashAssists,
      name: playerMatchStats.name,
    })
    .from(playerMatchStats)
    .innerJoin(matches, eq(matches.id, playerMatchStats.matchId))
    .where(
      and(
        eq(matches.teamId, teamId),
        eq(matches.parseStatus, "ready"),
        eq(playerMatchStats.steamId, steamId),
      ),
    )
    .orderBy(desc(matches.createdAt));

  if (!rows.length) return null;

  const recent = rows as PlayerMatchRow[];
  const name = recent[0].name || steamId;

  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let adrSum = 0;
  let kastSum = 0;
  let hsSum = 0;
  let utilDamage = 0;
  let firstKills = 0;
  let firstDeaths = 0;
  let flashAssists = 0;

  const mapAcc = new Map<
    string,
    { matches: number; kills: number; deaths: number; adr: number; kast: number; wins: number }
  >();

  for (const r of recent) {
    kills += r.kills;
    deaths += r.deaths;
    assists += r.assists;
    adrSum += r.adr;
    kastSum += r.kast;
    hsSum += r.headshotPct;
    utilDamage += r.utilDamage;
    firstKills += r.firstKills;
    firstDeaths += r.firstDeaths;
    flashAssists += r.flashAssists;

    const map = r.mapName ?? "unknown";
    let m = mapAcc.get(map);
    if (!m) {
      m = { matches: 0, kills: 0, deaths: 0, adr: 0, kast: 0, wins: 0 };
      mapAcc.set(map, m);
    }
    m.matches += 1;
    m.kills += r.kills;
    m.deaths += r.deaths;
    m.adr += r.adr;
    m.kast += r.kast;
    if (wonMatch(r) === true) m.wins += 1;
  }

  const matchesCount = recent.length;
  const adr = adrSum / matchesCount;
  const kast = kastSum / matchesCount;
  const headshotPct = hsSum / matchesCount;
  const kd = deaths === 0 ? kills : kills / deaths;
  const rating = edgeRating({
    kills,
    deaths,
    adr,
    kast,
    firstKills,
    firstDeaths,
    matches: matchesCount,
  });

  const maps: MapBreakdown[] = [...mapAcc.entries()]
    .map(([mapName, m]) => ({
      mapName,
      matches: m.matches,
      kills: m.kills,
      deaths: m.deaths,
      adr: m.adr / m.matches,
      kast: m.kast / m.matches,
      wins: m.wins,
    }))
    .sort((a, b) => b.matches - a.matches);

  let avatarUrl: string | null = null;
  const [member] = await db
    .select({ avatarUrl: users.avatarUrl, name: users.name })
    .from(users)
    .where(eq(users.steamId, steamId))
    .limit(1);
  if (member?.avatarUrl) avatarUrl = member.avatarUrl;
  else {
    try {
      const profile = await fetchSteamProfile(steamId);
      avatarUrl = profile.avatarUrl;
    } catch {
      /* ignore */
    }
  }

  return {
    steamId,
    name: member?.name || name,
    avatarUrl,
    matches: matchesCount,
    kills,
    deaths,
    assists,
    adr,
    kast,
    headshotPct,
    utilDamage,
    firstKills,
    firstDeaths,
    flashAssists,
    kd,
    rating,
    fkDiff: firstKills - firstDeaths,
    recent,
    maps,
  };
}
