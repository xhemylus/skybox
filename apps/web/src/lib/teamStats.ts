import { and, desc, eq, inArray } from "drizzle-orm";
import type { BuyType, Side } from "@skybox/shared";
import { db } from "@/db/client";
import { matches, playerMatchStats, rounds } from "@/db/schema";
import { edgeRating } from "@/lib/playerStats";
import { isLinkableTeamName, normalizeTeamKey } from "@/lib/teamIdentity";

export {
  decodeTeamSlug,
  isLinkableTeamName,
  normalizeTeamKey,
  teamHref,
  teamSlug,
} from "@/lib/teamIdentity";

export type TeamMatchRow = {
  matchId: string;
  mapName: string | null;
  teamAName: string | null;
  teamBName: string | null;
  scoreA: number | null;
  scoreB: number | null;
  tournament: string | null;
  tags: string[] | null;
  createdAt: Date;
  /** "A" | "B" — which side this profile team played */
  side: "A" | "B";
  opponent: string;
  result: "W" | "L" | "D" | null;
};

export type TeamRosterPlayer = {
  steamId: string;
  name: string;
  matches: number;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  kast: number;
  headshotPct: number;
  firstKills: number;
  firstDeaths: number;
  rating: number;
  kd: number;
};

export type TeamMapBreakdown = {
  mapName: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
};

export type TeamProfile = {
  name: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
  avgScoreFor: number;
  avgScoreAgainst: number;
  avgMargin: number;
  tournaments: string[];
  recent: TeamMatchRow[];
  maps: TeamMapBreakdown[];
  roster: TeamRosterPlayer[];
};

export type TeamListItem = {
  name: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winrate: number;
};

function sideOfTeam(
  teamKey: string,
  teamAName: string | null,
  teamBName: string | null,
): "A" | "B" | null {
  if (normalizeTeamKey(teamAName) === teamKey) return "A";
  if (normalizeTeamKey(teamBName) === teamKey) return "B";
  return null;
}

function matchResult(
  side: "A" | "B",
  scoreA: number | null,
  scoreB: number | null,
): "W" | "L" | "D" | null {
  if (scoreA == null || scoreB == null) return null;
  if (scoreA === scoreB) return "D";
  const aWon = scoreA > scoreB;
  if (side === "A") return aWon ? "W" : "L";
  return aWon ? "L" : "W";
}

function displayName(candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const t = c?.trim();
    if (t) return t;
  }
  return "Unknown";
}

export async function loadTeamProfile(
  skyboxTeamId: string,
  rawName: string,
): Promise<TeamProfile | null> {
  const key = normalizeTeamKey(rawName);
  if (!key) return null;

  const allReady = await db
    .select({
      id: matches.id,
      mapName: matches.mapName,
      teamAName: matches.teamAName,
      teamBName: matches.teamBName,
      scoreA: matches.scoreA,
      scoreB: matches.scoreB,
      tournament: matches.tournament,
      tags: matches.tags,
      createdAt: matches.createdAt,
    })
    .from(matches)
    .where(and(eq(matches.teamId, skyboxTeamId), eq(matches.parseStatus, "ready")))
    .orderBy(desc(matches.createdAt));

  const teamMatches = allReady.filter(
    (m) =>
      normalizeTeamKey(m.teamAName) === key || normalizeTeamKey(m.teamBName) === key,
  );
  if (!teamMatches.length) return null;

  const name = displayName(
    teamMatches.flatMap((m) =>
      normalizeTeamKey(m.teamAName) === key ? [m.teamAName] : [m.teamBName],
    ),
  );

  const recent: TeamMatchRow[] = [];
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let scoreFor = 0;
  let scoreAgainst = 0;
  let scoredMaps = 0;
  const tournamentCounts = new Map<string, number>();
  const mapAcc = new Map<string, { matches: number; wins: number; losses: number; draws: number }>();

  for (const m of teamMatches) {
    const side = sideOfTeam(key, m.teamAName, m.teamBName)!;
    const opponent =
      side === "A"
        ? displayName([m.teamBName, "Team Bravo"])
        : displayName([m.teamAName, "Team Alpha"]);
    const result = matchResult(side, m.scoreA, m.scoreB);
    if (result === "W") wins++;
    else if (result === "L") losses++;
    else if (result === "D") draws++;

    if (m.scoreA != null && m.scoreB != null) {
      scoredMaps++;
      if (side === "A") {
        scoreFor += m.scoreA;
        scoreAgainst += m.scoreB;
      } else {
        scoreFor += m.scoreB;
        scoreAgainst += m.scoreA;
      }
    }

    if (m.tournament?.trim()) {
      const t = m.tournament.trim();
      tournamentCounts.set(t, (tournamentCounts.get(t) ?? 0) + 1);
    }

    const mapName = m.mapName ?? "unknown";
    let map = mapAcc.get(mapName);
    if (!map) {
      map = { matches: 0, wins: 0, losses: 0, draws: 0 };
      mapAcc.set(mapName, map);
    }
    map.matches++;
    if (result === "W") map.wins++;
    else if (result === "L") map.losses++;
    else if (result === "D") map.draws++;

    recent.push({
      matchId: m.id,
      mapName: m.mapName,
      teamAName: m.teamAName,
      teamBName: m.teamBName,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      tournament: m.tournament,
      tags: m.tags,
      createdAt: m.createdAt,
      side,
      opponent,
      result,
    });
  }

  const matchIds = teamMatches.map((m) => m.id);
  const sideByMatch = new Map(recent.map((r) => [r.matchId, r.side]));

  const statRows =
    matchIds.length === 0
      ? []
      : await db
          .select()
          .from(playerMatchStats)
          .where(inArray(playerMatchStats.matchId, matchIds));

  type Acc = {
    name: string;
    matches: number;
    kills: number;
    deaths: number;
    assists: number;
    adrSum: number;
    kastSum: number;
    hsSum: number;
    firstKills: number;
    firstDeaths: number;
  };
  const rosterAcc = new Map<string, Acc>();

  for (const s of statRows) {
    const side = sideByMatch.get(s.matchId);
    if (!side || s.team !== side) continue;
    let acc = rosterAcc.get(s.steamId);
    if (!acc) {
      acc = {
        name: s.name,
        matches: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        adrSum: 0,
        kastSum: 0,
        hsSum: 0,
        firstKills: 0,
        firstDeaths: 0,
      };
      rosterAcc.set(s.steamId, acc);
    }
    acc.name = s.name || acc.name;
    acc.matches++;
    acc.kills += s.kills;
    acc.deaths += s.deaths;
    acc.assists += s.assists;
    acc.adrSum += s.adr;
    acc.kastSum += s.kast;
    acc.hsSum += s.headshotPct;
    acc.firstKills += s.firstKills;
    acc.firstDeaths += s.firstDeaths;
  }

  const roster: TeamRosterPlayer[] = [...rosterAcc.entries()]
    .map(([steamId, a]) => {
      const adr = a.matches ? a.adrSum / a.matches : 0;
      const kast = a.matches ? a.kastSum / a.matches : 0;
      const headshotPct = a.matches ? a.hsSum / a.matches : 0;
      return {
        steamId,
        name: a.name,
        matches: a.matches,
        kills: a.kills,
        deaths: a.deaths,
        assists: a.assists,
        adr,
        kast,
        headshotPct,
        firstKills: a.firstKills,
        firstDeaths: a.firstDeaths,
        kd: a.deaths === 0 ? a.kills : a.kills / a.deaths,
        rating: edgeRating({
          kills: a.kills,
          deaths: a.deaths,
          adr,
          kast,
          firstKills: a.firstKills,
          firstDeaths: a.firstDeaths,
          matches: a.matches,
        }),
      };
    })
    .sort((a, b) => b.rating - a.rating || b.adr - a.adr);

  const maps: TeamMapBreakdown[] = [...mapAcc.entries()]
    .map(([mapName, m]) => ({
      mapName,
      matches: m.matches,
      wins: m.wins,
      losses: m.losses,
      draws: m.draws,
      winrate: m.matches ? (m.wins / m.matches) * 100 : 0,
    }))
    .sort((a, b) => b.matches - a.matches);

  const tournaments = [...tournamentCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .slice(0, 8);

  const decided = wins + losses;
  return {
    name,
    matches: teamMatches.length,
    wins,
    losses,
    draws,
    winrate: decided ? (wins / decided) * 100 : 0,
    avgScoreFor: scoredMaps ? scoreFor / scoredMaps : 0,
    avgScoreAgainst: scoredMaps ? scoreAgainst / scoredMaps : 0,
    avgMargin: scoredMaps ? (scoreFor - scoreAgainst) / scoredMaps : 0,
    tournaments,
    recent,
    maps,
    roster,
  };
}

export async function listTeams(skyboxTeamId: string): Promise<TeamListItem[]> {
  const allReady = await db
    .select({
      teamAName: matches.teamAName,
      teamBName: matches.teamBName,
      scoreA: matches.scoreA,
      scoreB: matches.scoreB,
    })
    .from(matches)
    .where(and(eq(matches.teamId, skyboxTeamId), eq(matches.parseStatus, "ready")));

  type Acc = { name: string; matches: number; wins: number; losses: number; draws: number };
  const byKey = new Map<string, Acc>();

  function touch(raw: string | null, side: "A" | "B", scoreA: number | null, scoreB: number | null) {
    const key = normalizeTeamKey(raw);
    if (!key || !isLinkableTeamName(raw)) return;
    let acc = byKey.get(key);
    if (!acc) {
      acc = { name: raw!.trim(), matches: 0, wins: 0, losses: 0, draws: 0 };
      byKey.set(key, acc);
    } else if (raw?.trim() && acc.name.length < raw.trim().length) {
      // Prefer longer casing/label if somehow different
      acc.name = raw.trim();
    }
    acc.matches++;
    const result = matchResult(side, scoreA, scoreB);
    if (result === "W") acc.wins++;
    else if (result === "L") acc.losses++;
    else if (result === "D") acc.draws++;
  }

  for (const m of allReady) {
    touch(m.teamAName, "A", m.scoreA, m.scoreB);
    touch(m.teamBName, "B", m.scoreA, m.scoreB);
  }

  return [...byKey.values()]
    .map((a) => {
      const decided = a.wins + a.losses;
      return {
        name: a.name,
        matches: a.matches,
        wins: a.wins,
        losses: a.losses,
        draws: a.draws,
        winrate: decided ? (a.wins / decided) * 100 : 0,
      };
    })
    .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, "fr"));
}

export type ScoutRound = {
  matchId: string;
  roundId: string;
  roundNumber: number;
  mapName: string;
  createdAt: Date;
  tournament: string | null;
  opponent: string;
  teamKey: "A" | "B";
  side: Side;
  buy: BuyType;
  oppBuy: BuyType;
  result: "W" | "L" | null;
  scoreA: number;
  scoreB: number;
  bombSite: string | null;
  reason: string | null;
};

export type TeamMapScout = {
  teamName: string;
  mapName: string;
  matchCount: number;
  rounds: ScoutRound[];
};

function oppositeSide(side: Side): Side {
  return side === "CT" ? "T" : "CT";
}

/** All rounds for a CS2 team on one map across demos (for pistol / buy trend scouting). */
export async function loadTeamMapScout(
  skyboxTeamId: string,
  rawName: string,
  mapName: string,
): Promise<TeamMapScout | null> {
  const key = normalizeTeamKey(rawName);
  const map = mapName.trim().toLowerCase();
  if (!key || !map) return null;

  const allReady = await db
    .select({
      id: matches.id,
      mapName: matches.mapName,
      teamAName: matches.teamAName,
      teamBName: matches.teamBName,
      tournament: matches.tournament,
      createdAt: matches.createdAt,
    })
    .from(matches)
    .where(and(eq(matches.teamId, skyboxTeamId), eq(matches.parseStatus, "ready")))
    .orderBy(desc(matches.createdAt));

  const teamMatches = allReady.filter((m) => {
    if ((m.mapName ?? "").toLowerCase() !== map) return false;
    return normalizeTeamKey(m.teamAName) === key || normalizeTeamKey(m.teamBName) === key;
  });
  if (!teamMatches.length) return null;

  const teamName = displayName(
    teamMatches.flatMap((m) =>
      normalizeTeamKey(m.teamAName) === key ? [m.teamAName] : [m.teamBName],
    ),
  );

  const matchIds = teamMatches.map((m) => m.id);
  const metaById = new Map(teamMatches.map((m) => [m.id, m]));

  const roundRows = await db
    .select()
    .from(rounds)
    .where(inArray(rounds.matchId, matchIds))
    .orderBy(desc(rounds.matchId), rounds.number);

  // Keep match order (recent first), rounds ascending within match
  const orderIndex = new Map(matchIds.map((id, i) => [id, i]));
  roundRows.sort((a, b) => {
    const di = (orderIndex.get(a.matchId) ?? 0) - (orderIndex.get(b.matchId) ?? 0);
    if (di !== 0) return di;
    return a.number - b.number;
  });

  const scoutRounds: ScoutRound[] = [];
  for (const r of roundRows) {
    const meta = metaById.get(r.matchId);
    if (!meta) continue;
    const teamKey = sideOfTeam(key, meta.teamAName, meta.teamBName);
    if (!teamKey) continue;

    const sideA = r.sideA as Side;
    const side: Side = teamKey === "A" ? sideA : oppositeSide(sideA);
    const buy = (teamKey === "A" ? r.buyA : r.buyB) as BuyType;
    const oppBuy = (teamKey === "A" ? r.buyB : r.buyA) as BuyType;
    const won =
      r.winnerTeam === teamKey ? true : r.winnerTeam && r.winnerTeam !== teamKey ? false : null;
    const opponent =
      teamKey === "A"
        ? displayName([meta.teamBName, "Team Bravo"])
        : displayName([meta.teamAName, "Team Alpha"]);

    scoutRounds.push({
      matchId: r.matchId,
      roundId: r.id,
      roundNumber: r.number,
      mapName: meta.mapName ?? map,
      createdAt: meta.createdAt,
      tournament: meta.tournament,
      opponent,
      teamKey,
      side,
      buy,
      oppBuy,
      result: won === true ? "W" : won === false ? "L" : null,
      scoreA: r.scoreA,
      scoreB: r.scoreB,
      bombSite: r.bombSite,
      reason: r.reason,
    });
  }

  return {
    teamName,
    mapName: map,
    matchCount: teamMatches.length,
    rounds: scoutRounds,
  };
}
