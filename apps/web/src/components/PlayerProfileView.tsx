import Link from "next/link";
import { mapLabel } from "@/lib/format";
import type { PlayerProfile } from "@/lib/playerStats";
import { TeamNameLink } from "./TeamNameLink";

export function PlayerProfileView({ profile }: { profile: PlayerProfile }) {
  const form = profile.recent.slice(0, 12).map((m) => m.adr);
  const maxAdr = Math.max(...form, 1);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="panel relative overflow-hidden px-6 py-8 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_0%_0%,rgba(201,184,150,0.1),transparent_55%)]"
        />
        <div className="relative flex flex-wrap items-start gap-6">
          <div className="h-24 w-24 shrink-0 overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)] sm:h-28 sm:w-28">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-3xl text-[var(--accent)]">
                {profile.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="section-label">Profil joueur</p>
            <h1 className="page-title mt-1">{profile.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
              <a
                href={`https://steamcommunity.com/profiles/${profile.steamId}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[12px] hover:text-[var(--accent)]"
              >
                {profile.steamId}
              </a>
              <span>{profile.matches} map{profile.matches > 1 ? "s" : ""} analysée{profile.matches > 1 ? "s" : ""}</span>
            </div>
          </div>

          <div className="text-right">
            <p className="section-label">Rating</p>
            <p
              className={`font-display text-5xl leading-none tabular-nums ${
                profile.rating >= 1.1
                  ? "text-[var(--accent)]"
                  : profile.rating < 0.95
                    ? "text-[var(--danger)]"
                    : "text-[var(--text)]"
              }`}
            >
              {profile.rating.toFixed(2)}
            </p>
            <p className="muted mt-2 max-w-[11rem] text-[11px] leading-snug">
              Approximation type HLTV à partir des box scores
            </p>
          </div>
        </div>

        {/* Key stats strip */}
        <div className="relative mt-8 grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="K / D" value={profile.kd.toFixed(2)} />
          <StatTile label="ADR" value={profile.adr.toFixed(1)} />
          <StatTile label="KAST" value={`${profile.kast.toFixed(0)}%`} />
          <StatTile label="HS%" value={profile.headshotPct.toFixed(0)} />
          <StatTile
            label="FK diff"
            value={profile.fkDiff > 0 ? `+${profile.fkDiff}` : String(profile.fkDiff)}
            tone={profile.fkDiff > 0 ? "good" : profile.fkDiff < 0 ? "bad" : undefined}
          />
          <StatTile label="Util dmg" value={Math.round(profile.utilDamage).toLocaleString("fr-FR")} />
        </div>

        <div className="relative mt-4 flex flex-wrap gap-6 text-sm text-[var(--muted)]">
          <span>
            <span className="text-[var(--text)] tabular-nums">{profile.kills}</span> kills
          </span>
          <span>
            <span className="text-[var(--text)] tabular-nums">{profile.deaths}</span> deaths
          </span>
          <span>
            <span className="text-[var(--text)] tabular-nums">{profile.assists}</span> assists
          </span>
          <span>
            <span className="text-[var(--text)] tabular-nums">
              {profile.firstKills}/{profile.firstDeaths}
            </span>{" "}
            FK/FD
          </span>
          <span>
            <span className="text-[var(--text)] tabular-nums">{profile.flashAssists}</span> flash
            assists
          </span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Recent matches */}
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div>
              <p className="section-label">Derniers matchs</p>
              <h2 className="mt-1 text-[15px] font-medium tracking-wide">Forme récente</h2>
            </div>
            {form.length > 1 && (
              <div className="flex h-10 items-end gap-0.5" title="ADR par map (récent → ancien)">
                {[...form].reverse().map((adr, i) => (
                  <span
                    key={i}
                    className="w-2 rounded-sm bg-[var(--accent)] opacity-80"
                    style={{ height: `${Math.max(12, (adr / maxAdr) * 100)}%` }}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Match</th>
                  <th className="px-3 py-3 text-left font-medium">Map</th>
                  <th className="px-3 py-3 text-right font-medium">K-D-A</th>
                  <th className="px-3 py-3 text-right font-medium">+/-</th>
                  <th className="px-3 py-3 text-right font-medium">ADR</th>
                  <th className="px-3 py-3 text-right font-medium">KAST</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {profile.recent.map((m) => {
                  const diff = m.kills - m.deaths;
                  const won = (() => {
                    if (m.scoreA == null || m.scoreB == null || m.scoreA === m.scoreB) return null;
                    const aWon = m.scoreA > m.scoreB;
                    return m.team === "A" ? aWon : !aWon;
                  })();
                  const sideLabel = m.team === "A" ? m.teamAName ?? "A" : m.teamBName ?? "B";
                  const oppLabel = m.team === "A" ? m.teamBName ?? "B" : m.teamAName ?? "A";
                  return (
                    <tr
                      key={m.matchId}
                      className="border-t border-[var(--border)] hover:bg-[color-mix(in_oklab,var(--bg-hover)_70%,transparent)]"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              won === true
                                ? "bg-[var(--accent)]"
                                : won === false
                                  ? "bg-[var(--danger)]"
                                  : "bg-[var(--border-strong)]"
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="truncate font-medium tracking-wide">
                              <TeamNameLink name={sideLabel} />{" "}
                              <span className="font-mono text-[var(--muted)]">
                                {m.scoreA ?? "–"}:{m.scoreB ?? "–"}
                              </span>{" "}
                              <TeamNameLink name={oppLabel} />
                            </div>
                            <div className="muted text-[11px]">
                              {new Date(m.createdAt).toLocaleDateString("fr-FR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                              {m.tournament ? ` · ${m.tournament}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[var(--muted)]">{mapLabel(m.mapName)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {m.kills}-{m.deaths}-{m.assists}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono tabular-nums ${
                          diff > 0
                            ? "text-[var(--accent)]"
                            : diff < 0
                              ? "text-[var(--danger)]"
                              : "muted"
                        }`}
                      >
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{m.adr.toFixed(1)}</td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">
                        {m.kast.toFixed(0)}%
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/m/${m.matchId}`} className="btn btn-ghost !px-2 !py-1 text-[11px]">
                            Replay
                          </Link>
                          <Link
                            href={`/m/${m.matchId}/stats`}
                            className="btn btn-ghost !px-2 !py-1 text-[11px]"
                          >
                            Stats
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Map pool */}
        <section className="panel overflow-hidden self-start">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <p className="section-label">Map pool</p>
            <h2 className="mt-1 text-[15px] font-medium tracking-wide">Par carte</h2>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {profile.maps.map((m) => {
              const wr = m.matches ? Math.round((m.wins / m.matches) * 100) : 0;
              return (
                <li key={m.mapName} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="h-10 w-10 shrink-0 overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)]">
                    {m.mapName !== "unknown" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/maps/${m.mapName}.png`}
                        alt=""
                        className="h-full w-full object-cover opacity-70 grayscale"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium tracking-wide">{mapLabel(m.mapName)}</span>
                      <span className="muted text-[11px] tabular-nums">
                        {m.matches} map{m.matches > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="mt-1.5 h-px overflow-hidden bg-[var(--border)]">
                      <div className="h-full bg-[var(--accent)]" style={{ width: `${wr}%` }} />
                    </div>
                    <div className="muted mt-1.5 flex justify-between text-[11px] tabular-nums">
                      <span>
                        WR {wr}% · ADR {m.adr.toFixed(0)} · KAST {m.kast.toFixed(0)}%
                      </span>
                      <span>
                        {m.kills}/{m.deaths}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="bg-[var(--bg-panel)] px-4 py-4">
      <p className="section-label !tracking-[0.14em]">{label}</p>
      <p
        className={`mt-1.5 font-display text-2xl tabular-nums ${
          tone === "good"
            ? "text-[var(--accent)]"
            : tone === "bad"
              ? "text-[var(--danger)]"
              : "text-[var(--text)]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
