"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type AggregatePlayerStat = {
  steamId: string;
  name: string;
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
};

type SortKey =
  | "name"
  | "matches"
  | "kills"
  | "deaths"
  | "assists"
  | "kd"
  | "adr"
  | "kast"
  | "headshotPct"
  | "firstKills"
  | "utilDamage";

export function PlayerStatsTable({ rows }: { rows: AggregatePlayerStat[] }) {
  const [sort, setSort] = useState<SortKey>("adr");
  const [asc, setAsc] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) => r.name.toLowerCase().includes(q) || r.steamId.includes(q),
      );
    }
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => {
      const kdA = a.deaths === 0 ? a.kills : a.kills / a.deaths;
      const kdB = b.deaths === 0 ? b.kills : b.kills / b.deaths;
      const va =
        sort === "kd"
          ? kdA
          : sort === "name"
            ? a.name.toLowerCase()
            : a[sort];
      const vb =
        sort === "kd"
          ? kdB
          : sort === "name"
            ? b.name.toLowerCase()
            : b[sort];
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb, "fr") * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
  }, [rows, sort, asc, query]);

  function toggle(key: SortKey) {
    if (sort === key) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(key === "name");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="panel px-8 py-16 text-center">
        <p className="font-display text-2xl">Aucune stat</p>
        <p className="muted mt-2 text-sm">Importe et parse des démos pour voir les stats joueurs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[220px] flex-1 text-[11px] font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
          Joueur
          <input
            className="input mt-1.5"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pseudo ou SteamID…"
          />
        </label>
        <p className="muted pb-2 text-xs">
          {filtered.length} joueur{filtered.length > 1 ? "s" : ""} · agrégé sur les matchs prêts
        </p>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] text-[10px] tracking-[0.12em] text-[var(--muted)] uppercase">
              <tr>
                <Th active={sort === "name"} onClick={() => toggle("name")}>
                  Joueur
                </Th>
                <Th active={sort === "matches"} onClick={() => toggle("matches")} right>
                  Maps
                </Th>
                <Th active={sort === "kills"} onClick={() => toggle("kills")} right>
                  K
                </Th>
                <Th active={sort === "deaths"} onClick={() => toggle("deaths")} right>
                  D
                </Th>
                <Th active={sort === "assists"} onClick={() => toggle("assists")} right>
                  A
                </Th>
                <Th active={sort === "kd"} onClick={() => toggle("kd")} right>
                  K/D
                </Th>
                <Th active={sort === "adr"} onClick={() => toggle("adr")} right>
                  ADR
                </Th>
                <Th active={sort === "kast"} onClick={() => toggle("kast")} right>
                  KAST
                </Th>
                <Th active={sort === "headshotPct"} onClick={() => toggle("headshotPct")} right>
                  HS%
                </Th>
                <Th active={sort === "firstKills"} onClick={() => toggle("firstKills")} right>
                  FK
                </Th>
                <Th active={sort === "utilDamage"} onClick={() => toggle("utilDamage")} right>
                  Util
                </Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const kd = r.deaths === 0 ? r.kills : r.kills / r.deaths;
                return (
                  <tr
                    key={r.steamId}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[color-mix(in_oklab,var(--bg-hover)_70%,transparent)]"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/players/${r.steamId}`}
                        className="group block transition-colors hover:text-[var(--accent)]"
                      >
                        <div className="font-medium tracking-wide group-hover:underline">{r.name}</div>
                        <div className="muted font-mono text-[11px]">{r.steamId}</div>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{r.matches}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{r.kills}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{r.deaths}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{r.assists}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{kd.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--text)]">
                      {r.adr.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{r.kast.toFixed(0)}%</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {r.headshotPct.toFixed(0)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {r.firstKills}/{r.firstDeaths}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">
                      {Math.round(r.utilDamage)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  right,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  right?: boolean;
}) {
  return (
    <th className={`px-3 py-3.5 font-medium ${right ? "text-right" : "px-5 text-left"}`}>
      <button
        type="button"
        onClick={onClick}
        className={`tracking-[0.12em] uppercase transition-colors ${
          active ? "text-[var(--text)]" : "text-[var(--muted)] hover:text-[var(--text)]"
        }`}
      >
        {children}
      </button>
    </th>
  );
}
