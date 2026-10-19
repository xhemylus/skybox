"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BuyType, Side } from "@skybox/shared";
import type { ScoutRound } from "@/lib/teamStats";
import { TeamNameLink } from "./TeamNameLink";

type Filters = {
  side: Side | "";
  buy: BuyType | "";
  oppBuy: BuyType | "";
  result: "W" | "L" | "";
  site: "A" | "B" | "";
};

const EMPTY: Filters = { side: "", buy: "", oppBuy: "", result: "", site: "" };

const BUY_OPTS: { value: BuyType | ""; label: string }[] = [
  { value: "", label: "Tous" },
  { value: "pistol", label: "Pistol" },
  { value: "eco", label: "Eco" },
  { value: "force", label: "Force" },
  { value: "full", label: "Full" },
];

const PRESETS: { label: string; patch: Partial<Filters> }[] = [
  { label: "Pistols CT", patch: { buy: "pistol", side: "CT", oppBuy: "", result: "", site: "" } },
  { label: "Pistols T", patch: { buy: "pistol", side: "T", oppBuy: "", result: "", site: "" } },
  { label: "Full CT", patch: { buy: "full", side: "CT", oppBuy: "", result: "", site: "" } },
  { label: "Full T", patch: { buy: "full", side: "T", oppBuy: "", result: "", site: "" } },
  { label: "Force", patch: { buy: "force", side: "", oppBuy: "", result: "", site: "" } },
  { label: "Eco", patch: { buy: "eco", side: "", oppBuy: "", result: "", site: "" } },
];

export function TeamMapScout({
  teamName,
  mapLabel,
  rounds,
}: {
  teamName: string;
  mapLabel: string;
  rounds: ScoutRound[];
}) {
  const [filter, setFilter] = useState<Filters>(EMPTY);

  const filtered = useMemo(() => {
    return rounds.filter((r) => {
      if (filter.side && r.side !== filter.side) return false;
      if (filter.buy && r.buy !== filter.buy) return false;
      if (filter.oppBuy && r.oppBuy !== filter.oppBuy) return false;
      if (filter.result && r.result !== filter.result) return false;
      if (filter.site) {
        if (!r.bombSite || r.bombSite.toUpperCase() !== filter.site) return false;
      }
      return true;
    });
  }, [rounds, filter]);

  const summary = useMemo(() => {
    const decided = filtered.filter((r) => r.result);
    const wins = decided.filter((r) => r.result === "W").length;
    const losses = decided.filter((r) => r.result === "L").length;
    const siteA = filtered.filter((r) => r.bombSite?.toUpperCase() === "A").length;
    const siteB = filtered.filter((r) => r.bombSite?.toUpperCase() === "B").length;
    const planted = siteA + siteB;
    const byBuy = { pistol: 0, eco: 0, force: 0, full: 0, unknown: 0 };
    const bySide = { CT: 0, T: 0 };
    for (const r of filtered) {
      byBuy[r.buy] = (byBuy[r.buy] ?? 0) + 1;
      bySide[r.side]++;
    }
    return {
      total: filtered.length,
      wins,
      losses,
      wr: wins + losses ? (wins / (wins + losses)) * 100 : 0,
      siteA,
      siteB,
      siteAPct: planted ? (siteA / planted) * 100 : 0,
      siteBPct: planted ? (siteB / planted) * 100 : 0,
      byBuy,
      bySide,
    };
  }, [filtered]);

  function set(patch: Partial<Filters>) {
    setFilter((f) => ({ ...f, ...patch }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const active =
            filter.buy === (p.patch.buy ?? "") &&
            filter.side === (p.patch.side ?? "") &&
            !filter.oppBuy &&
            !filter.result &&
            !filter.site;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => setFilter({ ...EMPTY, ...p.patch })}
              className={`rounded-[var(--radius)] border px-3 py-1.5 text-[11px] font-medium tracking-[0.08em] uppercase transition-colors ${
                active
                  ? "border-[var(--text)] bg-[var(--text)] text-[var(--accent-ink)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
          onClick={() => setFilter(EMPTY)}
        >
          Reset
        </button>
      </div>

      <div className="panel grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Seg
          label="Side"
          value={filter.side}
          options={[
            { value: "", label: "Tous" },
            { value: "CT", label: "CT" },
            { value: "T", label: "T" },
          ]}
          onChange={(v) => set({ side: v as Side | "" })}
        />
        <Seg
          label="Notre buy"
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
            { value: "W", label: "Gagné" },
            { value: "L", label: "Perdu" },
          ]}
          onChange={(v) => set({ result: v as "W" | "L" | "" })}
        />
        <Seg
          label="Site planté"
          value={filter.site}
          options={[
            { value: "", label: "Peu importe" },
            { value: "A", label: "A" },
            { value: "B", label: "B" },
          ]}
          onChange={(v) => set({ site: v as "A" | "B" | "" })}
        />
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
        <Tile label="Rounds" value={String(summary.total)} />
        <Tile
          label="Winrate"
          value={summary.wins + summary.losses ? `${summary.wr.toFixed(0)}%` : "—"}
          tone={summary.wr >= 55 ? "good" : summary.wr < 45 && summary.wins + summary.losses ? "bad" : undefined}
        />
        <Tile label="W–L" value={`${summary.wins}–${summary.losses}`} />
        <Tile
          label="Sites A / B"
          value={
            summary.siteA + summary.siteB
              ? `${summary.siteAPct.toFixed(0)}% / ${summary.siteBPct.toFixed(0)}%`
              : "—"
          }
        />
      </div>

      <p className="muted text-xs">
        {teamName} · {mapLabel} · {summary.bySide.CT} CT / {summary.bySide.T} T · pistol{" "}
        {summary.byBuy.pistol} · full {summary.byBuy.full} · force {summary.byBuy.force} · eco{" "}
        {summary.byBuy.eco}
      </p>

      <div className="panel overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <p className="section-label">Rounds filtrés</p>
          <h2 className="mt-1 text-[15px] font-medium tracking-wide">
            {filtered.length} round{filtered.length !== 1 ? "s" : ""}
          </h2>
        </div>
        {filtered.length === 0 ? (
          <p className="muted px-5 py-12 text-center text-sm">Aucun round pour ces filtres.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Match</th>
                  <th className="px-3 py-3 text-left font-medium">R</th>
                  <th className="px-3 py-3 text-left font-medium">Side</th>
                  <th className="px-3 py-3 text-left font-medium">Buy</th>
                  <th className="px-3 py-3 text-left font-medium">Vs buy</th>
                  <th className="px-3 py-3 text-left font-medium">Site</th>
                  <th className="px-3 py-3 text-right font-medium">Résultat</th>
                  <th className="px-5 py-3 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.roundId}
                    className="border-t border-[var(--border)] hover:bg-[color-mix(in_oklab,var(--bg-hover)_70%,transparent)]"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium tracking-wide">
                        vs <TeamNameLink name={r.opponent} />
                      </div>
                      <div className="muted text-[11px]">
                        {new Date(r.createdAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                        })}
                        {r.tournament ? ` · ${r.tournament}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono tabular-nums">{r.roundNumber}</td>
                    <td className="px-3 py-3">{r.side}</td>
                    <td className="px-3 py-3 capitalize text-[var(--muted)]">{r.buy}</td>
                    <td className="px-3 py-3 capitalize text-[var(--muted)]">{r.oppBuy}</td>
                    <td className="px-3 py-3 text-[var(--muted)]">
                      {r.bombSite ? r.bombSite.toUpperCase() : "—"}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-medium tabular-nums ${
                        r.result === "W"
                          ? "text-[var(--accent)]"
                          : r.result === "L"
                            ? "text-[var(--danger)]"
                            : "muted"
                      }`}
                    >
                      {r.result ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/m/${r.matchId}?round=${r.roundNumber}&team=${r.teamKey}&side=${r.side}&buy=${r.buy}`}
                        className="btn btn-ghost !px-2 !py-1 text-[11px]"
                      >
                        Voir start
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
            type="button"
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

function Tile({
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
      <p className="section-label">{label}</p>
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
