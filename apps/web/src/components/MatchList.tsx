"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { humanizeParseError } from "@skybox/shared";
import { mapLabel } from "@/lib/format";
import { MatchMetaEditor, type MatchMeta } from "./MatchMetaEditor";
import { MatchRowMenu } from "./MatchRowMenu";
import { TeamNameLink } from "./TeamNameLink";

export type MatchRow = {
  id: string;
  filename: string;
  mapName: string | null;
  parseStatus: string;
  parseError: string | null;
  parseProgress?: number | null;
  parseStage?: string | null;
  scoreA: number | null;
  scoreB: number | null;
  teamAName: string | null;
  teamBName: string | null;
  tournament: string | null;
  tags: string[] | null;
  notes: string | null;
  createdAt: string | Date;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  processing: "Analyse…",
  ready: "Prêt",
  failed: "Échec",
};

type SortKey = "date" | "map" | "tournament" | "teams";

function isGenericNames(m: MatchRow) {
  return (
    !m.teamAName ||
    !m.teamBName ||
    /^(Team Alpha|Team Bravo)$/i.test(m.teamAName) ||
    /^(Team Alpha|Team Bravo)$/i.test(m.teamBName)
  );
}

function toMeta(m: MatchRow): MatchMeta {
  return {
    id: m.id,
    teamAName: m.teamAName,
    teamBName: m.teamBName,
    tournament: m.tournament,
    tags: m.tags,
    notes: m.notes,
    filename: m.filename,
  };
}

export function MatchList({
  matches,
  canManage,
}: {
  matches: MatchRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const busy = matches.some((m) => m.parseStatus === "pending" || m.parseStatus === "processing");

  const [query, setQuery] = useState("");
  const [tournament, setTournament] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<SortKey>("date");
  const [editing, setEditing] = useState<MatchMeta | null>(null);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, router]);

  // One-shot nudge: name teams on first ready match with generic names
  useEffect(() => {
    if (!canManage) return;
    const first = matches.find((m) => m.parseStatus === "ready" && isGenericNames(m));
    if (!first) return;
    const key = `meta-nudge:${first.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      return;
    }
    setEditing(toMeta(first));
    // Only on mount / when match list changes — not when closing the editor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, canManage]);

  const tournaments = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) if (m.tournament?.trim()) set.add(m.tournament.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [matches]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) for (const t of m.tags ?? []) if (t.trim()) set.add(t.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [matches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = matches.filter((m) => {
      if (tournament && (m.tournament ?? "") !== tournament) return false;
      if (tag && !(m.tags ?? []).some((t) => t.toLowerCase() === tag.toLowerCase())) return false;
      if (!q) return true;
      const hay = [
        m.filename,
        m.mapName,
        m.teamAName,
        m.teamBName,
        m.tournament,
        m.notes,
        ...(m.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    rows = [...rows].sort((a, b) => {
      if (sort === "map") return (a.mapName ?? "").localeCompare(b.mapName ?? "", "fr");
      if (sort === "tournament") {
        return (a.tournament ?? "zzz").localeCompare(b.tournament ?? "zzz", "fr");
      }
      if (sort === "teams") {
        const an = `${a.teamAName ?? ""} ${a.teamBName ?? ""}`;
        const bn = `${b.teamAName ?? ""} ${b.teamBName ?? ""}`;
        return an.localeCompare(bn, "fr");
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return rows;
  }, [matches, query, tournament, tag, sort]);

  async function remove(id: string) {
    if (!confirm("Supprimer ce match et ses fichiers ?")) return;
    const res = await fetch(`/api/matches/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  async function reparse(id: string) {
    const res = await fetch(`/api/matches/${id}/reparse`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Impossible de relancer l'analyse");
      return;
    }
    router.refresh();
  }

  if (matches.length === 0) {
    return (
      <div className="panel px-10 py-16 text-center">
        <p className="font-display text-2xl">Aucune démo</p>
        <p className="muted mt-2 text-sm">Importe une démo pour commencer la revue.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[200px] flex-1 text-[11px] font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
          Recherche
          <input
            className="input mt-1.5"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Équipe, map, tag, notes…"
          />
        </label>
        <label className="w-44 text-[11px] font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
          Tournoi
          <select className="input mt-1.5" value={tournament} onChange={(e) => setTournament(e.target.value)}>
            <option value="">Tous</option>
            {tournaments.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="w-40 text-[11px] font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
          Tag
          <select className="input mt-1.5" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Tous</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="w-40 text-[11px] font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
          Tri
          <select className="input mt-1.5" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="date">Date</option>
            <option value="teams">Équipes</option>
            <option value="tournament">Tournoi</option>
            <option value="map">Map</option>
          </select>
        </label>
        {(query || tournament || tag) && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setQuery("");
              setTournament("");
              setTag("");
            }}
          >
            Effacer
          </button>
        )}
      </div>

      <p className="muted text-xs">
        {filtered.length} / {matches.length} match{matches.length > 1 ? "s" : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="panel px-8 py-12 text-center">
          <p className="font-medium">Aucun résultat</p>
          <p className="muted mt-1 text-sm">Élargis les filtres ou ajoute des tags sur les démos.</p>
        </div>
      ) : (
        <div className="panel" style={{ overflow: "visible" }}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] text-[10px] tracking-[0.14em] text-[var(--muted)] uppercase">
              <tr>
                <th className="px-5 py-3.5 font-medium">Map</th>
                <th className="px-5 py-3.5 font-medium">Match</th>
                <th className="px-5 py-3.5 font-medium">Meta</th>
                <th className="px-5 py-3.5 font-medium">Date</th>
                <th className="px-5 py-3.5 font-medium">Statut</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const ready = m.parseStatus === "ready";
                const genericNames = isGenericNames(m);
                const analyzing = m.parseStatus === "pending" || m.parseStatus === "processing";
                return (
                  <tr
                    key={m.id}
                    className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[color-mix(in_oklab,var(--bg-hover)_70%,transparent)]"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3.5">
                        <div className="h-11 w-11 shrink-0 overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)]">
                          {m.mapName && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/maps/${m.mapName}.png`}
                              alt=""
                              className="h-full w-full object-cover opacity-70 grayscale"
                            />
                          )}
                        </div>
                        <span className="font-medium tracking-wide">{mapLabel(m.mapName)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {ready && m.scoreA != null ? (
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <TeamNameLink
                              name={m.teamAName}
                              fallback="Équipe A"
                              className={genericNames ? "text-[var(--danger)]" : "text-[var(--muted)]"}
                            />
                            <span className="font-mono text-[15px] font-medium tabular-nums">
                              <span
                                className={
                                  m.scoreA > (m.scoreB ?? 0) ? "text-[var(--text)]" : "text-[var(--muted)]"
                                }
                              >
                                {m.scoreA}
                              </span>
                              <span className="mx-1 text-[var(--border-strong)]">–</span>
                              <span
                                className={
                                  (m.scoreB ?? 0) > m.scoreA ? "text-[var(--text)]" : "text-[var(--muted)]"
                                }
                              >
                                {m.scoreB}
                              </span>
                            </span>
                            <TeamNameLink
                              name={m.teamBName}
                              fallback="Équipe B"
                              className={genericNames ? "text-[var(--danger)]" : "text-[var(--muted)]"}
                            />
                          </div>
                          {genericNames && canManage && (
                            <button
                              className="text-[11px] text-[var(--accent)] hover:underline"
                              onClick={() => setEditing(toMeta(m))}
                            >
                              Nommer les équipes
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="muted block max-w-[16rem] truncate" title={m.filename}>
                          {m.filename}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <div className="space-y-1.5">
                        {m.tournament ? (
                          <div className="line-clamp-2 text-[12px] text-[var(--text)]">{m.tournament}</div>
                        ) : (
                          <div className="muted text-[12px]">—</div>
                        )}
                        {(m.tags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(m.tags ?? []).slice(0, 3).map((t) => (
                              <span key={t} className="badge">
                                {t}
                              </span>
                            ))}
                            {(m.tags ?? []).length > 3 && (
                              <span className="muted text-[10px]">+{(m.tags ?? []).length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="muted px-5 py-3.5 align-middle whitespace-nowrap">
                      {new Date(m.createdAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <div className="max-w-[14rem]">
                        <span className={`badge badge-${m.parseStatus}`}>
                          {STATUS_LABEL[m.parseStatus] ?? m.parseStatus}
                          {m.parseStatus === "processing" && m.parseProgress != null
                            ? ` ${Math.min(99, m.parseProgress)}%`
                            : ""}
                        </span>
                        {analyzing && (
                          <div className="mt-1.5 w-28">
                            <div className="h-1 overflow-hidden rounded-full bg-[var(--border)]">
                              <div
                                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
                                style={{
                                  width: `${
                                    m.parseStatus === "pending"
                                      ? 4
                                      : Math.max(4, Math.min(99, m.parseProgress ?? 4))
                                  }%`,
                                }}
                              />
                            </div>
                            {m.parseStage ? (
                              <div
                                className="muted mt-1 truncate text-[10px]"
                                title={m.parseStage}
                              >
                                {m.parseStage}
                              </div>
                            ) : null}
                          </div>
                        )}
                        {m.parseStatus === "failed" && m.parseError && (
                          <div
                            className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-[var(--danger)]"
                            title={humanizeParseError(m.parseError)}
                          >
                            {humanizeParseError(m.parseError)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <div className="flex flex-nowrap items-center justify-end gap-2">
                        {ready && (
                          <Link href={`/m/${m.id}`} className="btn btn-primary shrink-0">
                            Replay
                          </Link>
                        )}
                        {m.parseStatus === "failed" && (
                          <button
                            type="button"
                            className="btn btn-primary shrink-0"
                            onClick={() => reparse(m.id)}
                          >
                            Relancer
                          </button>
                        )}
                        {analyzing && (
                          <Link href={`/m/${m.id}`} className="btn btn-ghost shrink-0">
                            Suivre
                          </Link>
                        )}
                        {(ready || m.parseStatus === "failed" || canManage) && (
                          <MatchRowMenu
                            matchId={m.id}
                            parseStatus={m.parseStatus}
                            canManage={canManage}
                            onMeta={() => setEditing(toMeta(m))}
                            onReparse={() => reparse(m.id)}
                            onRemove={() => remove(m.id)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <MatchMetaEditor
        match={editing}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
