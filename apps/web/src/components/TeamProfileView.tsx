import Link from "next/link";
import { mapLabel } from "@/lib/format";
import { teamSlug } from "@/lib/teamIdentity";
import type { TeamProfile } from "@/lib/teamStats";
import { TeamNameLink } from "./TeamNameLink";

export function TeamProfileView({ profile }: { profile: TeamProfile }) {
  const form = profile.recent.slice(0, 12).map((m) => (m.result === "W" ? 1 : m.result === "L" ? 0 : 0.5));
  const initials = profile.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-8">
      <section className="panel relative overflow-hidden px-6 py-8 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_0%_0%,rgba(201,184,150,0.1),transparent_55%)]"
        />
        <div className="relative flex flex-wrap items-start gap-6">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center border border-[var(--border)] bg-[var(--bg-elevated)] font-display text-3xl text-[var(--accent)] sm:h-28 sm:w-28">
            {initials || "?"}
          </div>

          <div className="min-w-0 flex-1">
            <p className="section-label">Profil équipe</p>
            <h1 className="page-title mt-1">{profile.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
              <span>
                {profile.matches} map{profile.matches > 1 ? "s" : ""}
              </span>
              <span className="tabular-nums">
                {profile.wins}W – {profile.losses}L
                {profile.draws ? ` – ${profile.draws}D` : ""}
              </span>
              {profile.tournaments.length > 0 && (
                <span className="truncate">{profile.tournaments.slice(0, 3).join(" · ")}</span>
              )}
            </div>
          </div>

          <div className="text-right">
            <p className="section-label">Winrate</p>
            <p
              className={`font-display text-5xl leading-none tabular-nums ${
                profile.winrate >= 55
                  ? "text-[var(--accent)]"
                  : profile.winrate < 45 && profile.wins + profile.losses > 0
                    ? "text-[var(--danger)]"
                    : "text-[var(--text)]"
              }`}
            >
              {profile.winrate.toFixed(0)}%
            </p>
            <p className="muted mt-2 text-[11px] tabular-nums">
              Score moy. {profile.avgScoreFor.toFixed(1)}–{profile.avgScoreAgainst.toFixed(1)}
              {profile.avgMargin !== 0 && (
                <>
                  {" "}
                  (
                  {profile.avgMargin > 0 ? "+" : ""}
                  {profile.avgMargin.toFixed(1)})
                </>
              )}
            </p>
          </div>
        </div>

        <div className="relative mt-8 grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Maps" value={String(profile.matches)} />
          <StatTile label="Victoires" value={String(profile.wins)} tone="good" />
          <StatTile label="Défaites" value={String(profile.losses)} tone="bad" />
          <StatTile label="WR" value={`${profile.winrate.toFixed(0)}%`} />
          <StatTile
            label="Marge"
            value={`${profile.avgMargin > 0 ? "+" : ""}${profile.avgMargin.toFixed(1)}`}
            tone={profile.avgMargin > 0 ? "good" : profile.avgMargin < 0 ? "bad" : undefined}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <div>
              <p className="section-label">Derniers matchs</p>
              <h2 className="mt-1 text-[15px] font-medium tracking-wide">Résultats récents</h2>
            </div>
            {form.length > 1 && (
              <div className="flex h-8 items-center gap-1" title="Forme (récent → ancien)">
                {[...form].reverse().map((v, i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-2.5 rounded-full ${
                      v === 1
                        ? "bg-[var(--accent)]"
                        : v === 0
                          ? "bg-[var(--danger)]"
                          : "bg-[var(--border-strong)]"
                    }`}
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
                  <th className="px-3 py-3 text-right font-medium">Score</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {profile.recent.map((m) => {
                  const us = m.side === "A" ? m.scoreA : m.scoreB;
                  const them = m.side === "A" ? m.scoreB : m.scoreA;
                  return (
                    <tr
                      key={m.matchId}
                      className="border-t border-[var(--border)] hover:bg-[color-mix(in_oklab,var(--bg-hover)_70%,transparent)]"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              m.result === "W"
                                ? "bg-[var(--accent)]"
                                : m.result === "L"
                                  ? "bg-[var(--danger)]"
                                  : "bg-[var(--border-strong)]"
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="truncate font-medium tracking-wide">
                              vs <TeamNameLink name={m.opponent} />
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
                        <span
                          className={
                            m.result === "W"
                              ? "text-[var(--accent)]"
                              : m.result === "L"
                                ? "text-[var(--danger)]"
                                : ""
                          }
                        >
                          {us ?? "–"}
                        </span>
                        <span className="text-[var(--border-strong)]">–</span>
                        <span>{them ?? "–"}</span>
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

        <div className="space-y-6">
          <section className="panel overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <p className="section-label">Roster</p>
              <h2 className="mt-1 text-[15px] font-medium tracking-wide">Joueurs</h2>
            </div>
            {profile.roster.length === 0 ? (
              <p className="muted px-5 py-8 text-center text-sm">Pas de joueurs liés</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {profile.roster.slice(0, 12).map((p) => (
                  <li key={p.steamId}>
                    <Link
                      href={`/players/${p.steamId}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-[var(--bg-hover)]"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium tracking-wide">{p.name}</div>
                        <div className="muted text-[11px] tabular-nums">
                          {p.matches} map{p.matches > 1 ? "s" : ""} · ADR {p.adr.toFixed(0)} · KAST{" "}
                          {p.kast.toFixed(0)}%
                        </div>
                      </div>
                      <span
                        className={`shrink-0 font-display text-lg tabular-nums ${
                          p.rating >= 1.1
                            ? "text-[var(--accent)]"
                            : p.rating < 0.95
                              ? "text-[var(--danger)]"
                              : "text-[var(--text)]"
                        }`}
                      >
                        {p.rating.toFixed(2)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <p className="section-label">Map pool</p>
              <h2 className="mt-1 text-[15px] font-medium tracking-wide">Par carte</h2>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {profile.maps.map((m) => (
                <li key={m.mapName}>
                  <Link
                    href={`/teams/${teamSlug(profile.name)}/maps/${encodeURIComponent(m.mapName)}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--bg-hover)]"
                  >
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
                          {m.wins}W–{m.losses}L
                        </span>
                      </div>
                      <div className="mt-1.5 h-px overflow-hidden bg-[var(--border)]">
                        <div className="h-full bg-[var(--accent)]" style={{ width: `${m.winrate}%` }} />
                      </div>
                      <div className="muted mt-1.5 flex justify-between text-[11px] tabular-nums">
                        <span>
                          {m.matches} map{m.matches > 1 ? "s" : ""} · WR {m.winrate.toFixed(0)}%
                        </span>
                        <span className="text-[var(--accent)]">Scout →</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
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
