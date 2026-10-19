"use client";

import Link from "next/link";

type PlayerRow = {
  steamId: string;
  name: string;
  team: string;
  kills: number;
  deaths: number;
  assists: number;
  adr: number;
  kast: number;
  utilDamage: number;
  headshotPct: number;
  firstKills: number;
  firstDeaths: number;
  flashAssists: number;
};

type RoundRow = {
  number: number;
  winner: string | null;
  winnerTeam: string | null;
  buyA: string;
  buyB: string;
  scoreA: number;
  scoreB: number;
  reason: string | null;
  sideA: string;
};

export function StatsPanel({
  stats,
  rounds,
  teamAName,
  teamBName,
}: {
  stats: PlayerRow[];
  rounds: RoundRow[];
  teamAName: string | null;
  teamBName: string | null;
}) {
  const a = stats.filter((s) => s.team === "A").sort((x, y) => y.kills - x.kills || y.adr - x.adr);
  const b = stats.filter((s) => s.team === "B").sort((x, y) => y.kills - x.kills || y.adr - x.adr);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <Scoreboard title={teamAName ?? "Team Alpha"} rows={a} accent="var(--ct)" />
        <Scoreboard title={teamBName ?? "Team Bravo"} rows={b} accent="var(--t)" />
      </div>

      <div className="panel overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-3.5">
          <p className="section-label">Rounds</p>
        </div>
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--bg-panel)] text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
              <tr>
                <th className="px-5 py-3 text-left font-medium">#</th>
                <th className="px-5 py-3 text-left font-medium">Gagnant</th>
                <th className="px-5 py-3 text-left font-medium">Buy A / B</th>
                <th className="px-5 py-3 text-left font-medium">Score</th>
                <th className="px-5 py-3 text-left font-medium">Raison</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.number} className="border-t border-[var(--border)]">
                  <td className="px-5 py-2.5 tabular-nums">{r.number}</td>
                  <td className="px-5 py-2.5">
                    {r.winnerTeam === "A"
                      ? (teamAName ?? "A")
                      : r.winnerTeam === "B"
                        ? (teamBName ?? "B")
                        : (r.winner ?? "—")}
                    {r.winner ? (
                      <span className="muted ml-1.5 text-xs">({r.winner})</span>
                    ) : null}
                  </td>
                  <td className="muted px-5 py-2.5 capitalize">
                    {r.buyA} / {r.buyB}
                  </td>
                  <td className="px-5 py-2.5 font-mono tabular-nums">
                    {r.scoreA}–{r.scoreB}
                  </td>
                  <td className="muted px-5 py-2.5">{r.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Scoreboard({
  title,
  rows,
  accent,
}: {
  title: string;
  rows: PlayerRow[];
  accent: string;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
        <h2 className="font-medium tracking-wide" style={{ color: accent }}>
          {title}
        </h2>
        <span className="muted text-xs tabular-nums">{rows.length} joueurs</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Joueur</th>
              <th className="px-3 py-2.5 text-right font-medium">K</th>
              <th className="px-3 py-2.5 text-right font-medium">D</th>
              <th className="px-3 py-2.5 text-right font-medium">A</th>
              <th className="px-3 py-2.5 text-right font-medium">+/-</th>
              <th className="px-3 py-2.5 text-right font-medium">ADR</th>
              <th className="px-3 py-2.5 text-right font-medium">KAST</th>
              <th className="px-3 py-2.5 text-right font-medium">HS%</th>
              <th className="px-3 py-2.5 text-right font-medium">FK</th>
              <th className="px-3 py-2.5 text-right font-medium">Util</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="muted px-4 py-8 text-center text-sm">
                  Pas de stats
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const diff = r.kills - r.deaths;
                return (
                  <tr key={r.steamId} className="border-t border-[var(--border)]">
                    <td className="px-4 py-2.5 font-medium">
                      <Link href={`/players/${r.steamId}`} className="hover:text-[var(--accent)] hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.kills}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.deaths}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.assists}</td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                        diff > 0 ? "text-[var(--accent)]" : diff < 0 ? "text-[var(--danger)]" : "muted"
                      }`}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.adr.toFixed(1)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {r.kast.toFixed(0)}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {r.headshotPct.toFixed(0)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {r.firstKills}/{r.firstDeaths}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {r.utilDamage.toFixed(0)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
