import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { PlayerStatsTable, type AggregatePlayerStat } from "@/components/PlayerStatsTable";
import { db } from "@/db/client";
import { matches, playerMatchStats } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export default async function TeamStatsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.team) redirect("/team");

  const rows = await db
    .select({
      steamId: playerMatchStats.steamId,
      name: playerMatchStats.name,
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
      matchId: playerMatchStats.matchId,
    })
    .from(playerMatchStats)
    .innerJoin(matches, eq(matches.id, playerMatchStats.matchId))
    .where(and(eq(matches.teamId, user.team.id), eq(matches.parseStatus, "ready")));

  const bySteam = new Map<
    string,
    AggregatePlayerStat & { _adrSum: number; _kastSum: number; _hsSum: number }
  >();

  for (const r of rows) {
    let acc = bySteam.get(r.steamId);
    if (!acc) {
      acc = {
        steamId: r.steamId,
        name: r.name,
        matches: 0,
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
        _adrSum: 0,
        _kastSum: 0,
        _hsSum: 0,
      };
      bySteam.set(r.steamId, acc);
    }
    acc.name = r.name || acc.name;
    acc.matches += 1;
    acc.kills += r.kills;
    acc.deaths += r.deaths;
    acc.assists += r.assists;
    acc.utilDamage += r.utilDamage;
    acc.firstKills += r.firstKills;
    acc.firstDeaths += r.firstDeaths;
    acc.flashAssists += r.flashAssists;
    acc._adrSum += r.adr;
    acc._kastSum += r.kast;
    acc._hsSum += r.headshotPct;
  }

  const aggregated: AggregatePlayerStat[] = [...bySteam.values()].map((a) => ({
    steamId: a.steamId,
    name: a.name,
    matches: a.matches,
    kills: a.kills,
    deaths: a.deaths,
    assists: a.assists,
    adr: a.matches ? a._adrSum / a.matches : 0,
    kast: a.matches ? a._kastSum / a.matches : 0,
    headshotPct: a.matches ? a._hsSum / a.matches : 0,
    utilDamage: a.utilDamage,
    firstKills: a.firstKills,
    firstDeaths: a.firstDeaths,
    flashAssists: a.flashAssists,
  }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-shell space-y-8">
        <header>
          <p className="section-label mb-2">Analyse</p>
          <h1 className="page-title">Stats joueurs</h1>
          <p className="muted mt-2 text-sm">
            Agrégat des matchs prêts · {user.team.name}
          </p>
        </header>
        <PlayerStatsTable rows={aggregated} />
      </div>
    </div>
  );
}
