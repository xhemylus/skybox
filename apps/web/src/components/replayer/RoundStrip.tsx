"use client";

import { useEffect, useRef, useState } from "react";
import { isHalfBoundary, type BuyType, type ReplayData, type Side, type TeamKey } from "@skybox/shared";
import {
  EMPTY_FILTER,
  FILTER_PRESETS,
  SIDE_COLOR,
  filterActive,
  roundMatches,
  type RoundFilter,
} from "./model";

const BUY_OPTS: { value: BuyType | ""; label: string }[] = [
  { value: "", label: "Tous" },
  { value: "pistol", label: "Pistol" },
  { value: "eco", label: "Eco" },
  { value: "force", label: "Force" },
  { value: "full", label: "Full" },
];

export function RoundStrip({
  replay,
  current,
  multi,
  selected,
  filter,
  onSelect,
  onToggleMulti,
  onFilterChange,
  onFilteredStep,
  showAdvanced = false,
  notedRounds,
}: {
  replay: ReplayData;
  current: number;
  multi: boolean;
  selected: number[];
  filter: RoundFilter;
  onSelect: (index: number) => void;
  onToggleMulti: () => void;
  onFilterChange: (f: RoundFilter) => void;
  /** Step to prev/next round matching the filter (falls back to adjacent). */
  onFilteredStep: (dir: -1 | 1) => void;
  /** Multiround + filter presets strip (coach tools). */
  showAdvanced?: boolean;
  /** Round numbers that have a review note. */
  notedRounds?: Set<number>;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = filterActive(filter);
  const focusTeam = replay.teams.find((t) => t.key === filter.team);

  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-round="${current}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current]);

  return (
    <div className="space-y-1.5">
      {showAdvanced && active && (
        <div className="flex flex-wrap items-center gap-1.5 px-0.5">
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
                onClick={() => onFilterChange({ ...filter, ...EMPTY_FILTER, team: filter.team, ...p.patch })}
                className={`rounded-[var(--radius)] border px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] uppercase transition-colors ${
                  on
                    ? "border-[var(--text)] bg-[var(--text)] text-[var(--accent-ink)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
          <span className="ml-1 text-[10px] tracking-wide text-[var(--muted)]">
            Side / buy · {focusTeam?.name ?? filter.team}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2">
        {showAdvanced && (
          <button
            onClick={onToggleMulti}
            className={`h-8 shrink-0 rounded-[var(--radius)] px-2.5 text-[11px] font-medium tracking-[0.08em] transition-colors ${
              multi ? "text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
            title="Superposer plusieurs rounds (M)"
          >
            Multiround
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className={`h-8 shrink-0 rounded-[var(--radius)] border px-3 text-[10px] font-medium tracking-[0.14em] uppercase transition-colors ${
              active
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            Filtres{active ? " ·" : ""}
          </button>
          {filterOpen && (
            <FilterPopover
              replay={replay}
              filter={filter}
              onChange={onFilterChange}
              onClose={() => setFilterOpen(false)}
            />
          )}
        </div>

        <button
          className="px-1 text-[var(--muted)] hover:text-[var(--text)]"
          onClick={() => onFilteredStep(-1)}
          title="Round précédent (filtre)"
        >
          ‹
        </button>
        <div ref={scrollRef} className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
          {replay.rounds.map((r, i) => {
            const isCurrent = multi ? selected.includes(i) : i === current;
            const matches = !active || roundMatches(r, filter);
            const teamSide = r.sideOf[filter.team];
            return (
              <div key={r.number} className="flex shrink-0 items-center gap-1">
                <button
                  data-round={i}
                  onClick={() => onSelect(i)}
                  title={`R${r.number} · ${focusTeam?.name ?? filter.team} ${teamSide} · ${r.buy[filter.team]} · vs ${r.buy[filter.team === "A" ? "B" : "A"]}${notedRounds?.has(r.number) ? " · note" : ""}`}
                  className={`relative flex h-7 w-7 flex-col items-center justify-center rounded-[var(--radius)] text-[12px] font-medium tabular-nums transition-all ${
                    isCurrent
                      ? "bg-[var(--text)] text-[var(--accent-ink)]"
                      : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  } ${matches ? "" : "opacity-25"}`}
                >
                  {r.number}
                  <span
                    className="mt-0.5 h-px w-3"
                    style={{
                      background: isCurrent ? "var(--accent-ink)" : SIDE_COLOR[teamSide],
                    }}
                  />
                  {notedRounds?.has(r.number) && (
                    <span
                      className={`absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ${
                        isCurrent ? "bg-[var(--accent-ink)]" : "bg-[var(--accent)]"
                      }`}
                    />
                  )}
                </button>
                {isHalfBoundary(r.number) && i < replay.rounds.length - 1 && (
                  <span className="mx-1 h-5 w-px border-l border-dashed border-[var(--muted)]" />
                )}
              </div>
            );
          })}
        </div>
        <button
          className="px-1 text-[var(--muted)] hover:text-[var(--text)]"
          onClick={() => onFilteredStep(1)}
          title="Round suivant (filtre)"
        >
          ›
        </button>
      </div>
    </div>
  );
}

function FilterPopover({
  replay,
  filter,
  onChange,
  onClose,
}: {
  replay: ReplayData;
  filter: RoundFilter;
  onChange: (f: RoundFilter) => void;
  onClose: () => void;
}) {
  const count = replay.rounds.filter((r) => roundMatches(r, filter)).length;
  const set = (patch: Partial<RoundFilter>) => onChange({ ...filter, ...patch });
  const teamName = replay.teams.find((t) => t.key === filter.team)?.name ?? filter.team;

  return (
    <div className="absolute bottom-10 left-0 z-40 w-80 space-y-3 border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Filtrer les rounds</span>
        <button className="text-[var(--muted)] hover:text-[var(--text)]" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
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
              onClick={() => set({ ...p.patch, oppBuy: "", result: "", site: "" })}
              className={`rounded-[var(--radius)] border px-2 py-1 text-[10px] font-medium tracking-[0.06em] uppercase ${
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

      <Seg
        label="Équipe (référence side / buy)"
        value={filter.team}
        options={replay.teams.map((t) => ({ value: t.key, label: t.name }))}
        onChange={(v) => set({ team: v as TeamKey })}
      />
      <p className="text-[10px] leading-relaxed text-[var(--muted)]">
        CT / T et le buy sont ceux de <span className="text-[var(--text)]">{teamName}</span> à
        chaque round (après half / OT inclus).
      </p>
      <Seg
        label={`Side · ${teamName}`}
        value={filter.side}
        options={[
          { value: "", label: "Tous" },
          { value: "CT", label: "CT" },
          { value: "T", label: "T" },
        ]}
        onChange={(v) => set({ side: v as Side | "" })}
      />
      <Seg
        label={`Buy · ${teamName}`}
        value={filter.buy}
        options={BUY_OPTS}
        onChange={(v) => set({ buy: v as BuyType | "" })}
      />
      <Seg
        label="Buy adverse"
        value={filter.oppBuy}
        options={BUY_OPTS}
        onChange={(v) => set({ oppBuy: v as BuyType | "" })}
      />
      <Seg
        label="Résultat"
        value={filter.result}
        options={[
          { value: "", label: "Tous" },
          { value: "win", label: "Gagné" },
          { value: "loss", label: "Perdu" },
        ]}
        onChange={(v) => set({ result: v as RoundFilter["result"] })}
      />
      <Seg
        label="Bombe posée"
        value={filter.site}
        options={[
          { value: "", label: "Peu importe" },
          { value: "A", label: "Site A" },
          { value: "B", label: "Site B" },
        ]}
        onChange={(v) => set({ site: v as RoundFilter["site"] })}
      />
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-xs text-[var(--muted)]">
        <span>
          {count} round{count > 1 ? "s" : ""} correspondant{count > 1 ? "s" : ""}
        </span>
        <button
          className="hover:text-[var(--text)]"
          onClick={() =>
            onChange({ ...filter, side: "", buy: "", oppBuy: "", result: "", site: "" })
          }
        >
          Réinitialiser
        </button>
      </div>
    </div>
  );
}

function Seg({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.value || "all"}
            onClick={() => onChange(o.value)}
            className={`rounded-[var(--radius)] px-2.5 py-1 text-xs transition-colors ${
              value === o.value
                ? "bg-[var(--text)] text-[var(--accent-ink)]"
                : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
