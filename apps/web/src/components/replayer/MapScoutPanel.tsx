"use client";

import { useEffect, useMemo, useState } from "react";
import type { BuyType, Side, TeamKey } from "@skybox/shared";
import { FILTER_PRESETS, SIDE_COLOR, type RoundFilter } from "./model";

export type ScoutRoundDto = {
  matchId: string;
  roundId: string;
  roundNumber: number;
  createdAt: string;
  tournament: string | null;
  opponent: string;
  teamKey: TeamKey;
  side: Side;
  buy: BuyType;
  oppBuy: BuyType;
  result: "W" | "L" | null;
  bombSite: string | null;
};

export type ScoutMatchGroup = {
  matchId: string;
  opponent: string;
  createdAt: string;
  tournament: string | null;
  rounds: ScoutRoundDto[];
};

type ScoutPayload = {
  teamName: string;
  mapName: string;
  matchCount: number;
  rounds: ScoutRoundDto[];
};

export const MATCH_TINTS = [
  "#c9b896",
  "#7aa3c7",
  "#a78bfa",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#22d3ee",
  "#fb7185",
];

export function filterScoutRounds(rounds: ScoutRoundDto[], filter: RoundFilter): ScoutRoundDto[] {
  return rounds.filter((r) => {
    if (filter.side && r.side !== filter.side) return false;
    if (filter.buy && r.buy !== filter.buy) return false;
    if (filter.oppBuy && r.oppBuy !== filter.oppBuy) return false;
    if (filter.result === "win" && r.result !== "W") return false;
    if (filter.result === "loss" && r.result !== "L") return false;
    if (filter.site) {
      if (!r.bombSite || r.bombSite.toUpperCase() !== filter.site) return false;
    }
    return true;
  });
}

export function groupScoutByMatch(rounds: ScoutRoundDto[]): ScoutMatchGroup[] {
  const map = new Map<string, ScoutMatchGroup>();
  for (const r of rounds) {
    let g = map.get(r.matchId);
    if (!g) {
      g = {
        matchId: r.matchId,
        opponent: r.opponent,
        createdAt: r.createdAt,
        tournament: r.tournament,
        rounds: [],
      };
      map.set(r.matchId, g);
    }
    g.rounds.push(r);
  }
  return [...map.values()];
}

export function MapScoutPanel({
  matchId,
  filter,
  onFilterChange,
  overlayActive,
  enabledMatches,
  highlightedMatchId,
  overlayLoading,
  onStartOverlay,
  onStopOverlay,
  onToggleMatch,
  onSoloMatch,
}: {
  matchId: string;
  filter: RoundFilter;
  onFilterChange: (f: RoundFilter) => void;
  overlayActive: boolean;
  enabledMatches: Set<string>;
  highlightedMatchId?: string | null;
  overlayLoading: boolean;
  onStartOverlay: (rounds: ScoutRoundDto[]) => void;
  onStopOverlay: () => void;
  onToggleMatch: (matchId: string) => void;
  /** Solo = only this match enabled (like player focus) */
  onSoloMatch: (matchId: string) => void;
}) {
  const [data, setData] = useState<ScoutPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/matches/${matchId}/map-scout?team=${filter.team}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
        return res.json() as Promise<ScoutPayload>;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, filter.team]);

  const filtered = useMemo(
    () => (data ? filterScoutRounds(data.rounds, filter) : []),
    [data, filter],
  );

  const groups = useMemo(() => groupScoutByMatch(filtered), [filtered]);

  const summary = useMemo(() => {
    const decided = filtered.filter((r) => r.result);
    const wins = decided.filter((r) => r.result === "W").length;
    const losses = decided.filter((r) => r.result === "L").length;
    return {
      total: filtered.length,
      matches: groups.length,
      wins,
      losses,
      wr: wins + losses ? Math.round((wins / (wins + losses)) * 100) : null,
    };
  }, [filtered, groups.length]);

  function applyPreset(patch: Partial<RoundFilter>) {
    onFilterChange({
      ...filter,
      side: "",
      buy: "",
      oppBuy: "",
      result: "",
      site: "",
      ...patch,
    });
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[#0f0f11]">
      <div className="border-b border-[var(--border)] px-3 py-2">
        <p className="text-[10px] font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
          Scout map
        </p>
        <p className="mt-0.5 text-[13px] font-semibold tracking-wide">
          {data?.teamName ?? "…"}
          {data ? (
            <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">
              · {data.matchCount} démo{data.matchCount > 1 ? "s" : ""}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[var(--border)] px-3 py-2">
        {FILTER_PRESETS.map((p) => {
          const on =
            filter.buy === (p.patch.buy ?? "") &&
            filter.side === (p.patch.side ?? "") &&
            !filter.oppBuy &&
            !filter.result &&
            !filter.site;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.patch)}
              className={`rounded-[var(--radius)] border px-2 py-0.5 text-[9px] font-medium tracking-[0.06em] uppercase ${
                on
                  ? "border-[var(--text)] bg-[var(--text)] text-[var(--accent-ink)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-px border-b border-[var(--border)] bg-[var(--border)] text-center">
        <div className="bg-[#0f0f11] px-2 py-2">
          <p className="text-[9px] tracking-[0.1em] text-[var(--muted)] uppercase">Rounds</p>
          <p className="font-display text-lg tabular-nums">{summary.total}</p>
        </div>
        <div className="bg-[#0f0f11] px-2 py-2">
          <p className="text-[9px] tracking-[0.1em] text-[var(--muted)] uppercase">Matchs</p>
          <p className="font-display text-lg tabular-nums">{summary.matches}</p>
        </div>
        <div className="bg-[#0f0f11] px-2 py-2">
          <p className="text-[9px] tracking-[0.1em] text-[var(--muted)] uppercase">WR</p>
          <p className="font-display text-lg tabular-nums">
            {summary.wr != null ? `${summary.wr}%` : "—"}
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[var(--border)] px-3 py-2">
        {overlayActive ? (
          <>
            <button
              type="button"
              className="btn btn-ghost h-7 flex-1 px-2 text-[11px]"
              onClick={onStopOverlay}
            >
              Quitter overlay
            </button>
            <span className="flex items-center text-[10px] text-[var(--muted)]">
              {enabledMatches.size}/{groups.length} matchs
            </span>
          </>
        ) : (
          <button
            type="button"
            className="btn h-7 flex-1 px-2 text-[11px]"
            disabled={loading || filtered.length === 0 || overlayLoading}
            onClick={() => onStartOverlay(filtered)}
          >
            {overlayLoading ? "Chargement…" : `Superposer (${summary.total})`}
          </button>
        )}
      </div>

      <div className="max-h-[46vh] overflow-y-auto">
        {loading ? (
          <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">Chargement…</p>
        ) : error ? (
          <p className="px-3 py-6 text-center text-xs text-[var(--danger)]">{error}</p>
        ) : groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-[var(--muted)]">Aucun round.</p>
        ) : (
          groups.map((g, gi) => {
            const tint = MATCH_TINTS[gi % MATCH_TINTS.length];
            const enabled = !overlayActive || enabledMatches.has(g.matchId);
            const isCurrent = g.matchId === matchId;
            const highlighted = highlightedMatchId === g.matchId;
            const sides = [...new Set(g.rounds.map((r) => r.side))].join("/");
            return (
              <button
                key={g.matchId}
                type="button"
                disabled={!overlayActive}
                onClick={() => onToggleMatch(g.matchId)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  onSoloMatch(g.matchId);
                }}
                title={
                  overlayActive
                    ? "Clic : activer/désactiver · Double-clic : seul ce match"
                    : "Lance « Superposer » pour activer/désactiver les matchs"
                }
                className={`block w-full border-t border-[var(--border)] px-3 py-2 text-left transition-colors disabled:cursor-default ${
                  highlighted
                    ? "bg-[var(--bg-elevated)] ring-1 ring-inset ring-[var(--accent)]"
                    : overlayActive && enabled
                      ? "bg-[var(--bg-hover)]"
                      : ""
                } ${overlayActive && !highlighted ? "hover:bg-[var(--bg-elevated)]" : ""} ${
                  overlayActive && !enabled ? "opacity-35" : ""
                } ${
                  overlayActive && highlightedMatchId && !highlighted && enabled ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: enabled ? tint : "transparent", boxShadow: `0 0 0 1px ${tint}` }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium tracking-wide">
                      vs {g.opponent}
                      {isCurrent ? (
                        <span className="ml-1 text-[10px] text-[var(--accent)]">· ici</span>
                      ) : null}
                    </div>
                    <div className="truncate text-[10px] text-[var(--muted)]">
                      {new Date(g.createdAt).toLocaleDateString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                      })}
                      {g.tournament ? ` · ${g.tournament}` : ""}
                      {" · "}
                      {g.rounds.map((r) => `R${r.roundNumber}`).join(", ")}
                      {" · "}
                      <span style={{ color: SIDE_COLOR[g.rounds[0]?.side ?? "CT"] }}>{sides}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">
                    {g.rounds.length}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
