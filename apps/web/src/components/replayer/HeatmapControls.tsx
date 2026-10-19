"use client";

import { useState } from "react";
import {
  HEATMAP_MODES,
  isUtilMode,
  type HeatmapConfig,
  type HeatmapMode,
  type HeatmapPlayerOption,
  type HeatmapSide,
} from "./heatmap";
import { SIDE_COLOR } from "./model";

export function HeatmapControls({
  config,
  onChange,
  players,
  pointCount,
  roundCount,
  arcCount,
}: {
  config: HeatmapConfig;
  onChange: (c: HeatmapConfig) => void;
  players: HeatmapPlayerOption[];
  pointCount: number | null;
  roundCount: number;
  arcCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const active = config.mode !== "off";
  const utilActive = isUtilMode(config.mode);

  const filteredPlayers = players.filter((p) => !config.side || p.side === config.side);
  const selectedName = config.steamId
    ? (players.find((p) => p.steamId === config.steamId)?.name ?? "Joueur")
    : null;

  const modeLabel = HEATMAP_MODES.find((m) => m.value === config.mode)?.label;

  function setSide(side: HeatmapSide) {
    const next: HeatmapConfig = { ...config, side };
    if (next.steamId) {
      const pl = players.find((p) => p.steamId === next.steamId);
      if (pl && side && pl.side !== side) next.steamId = "";
    }
    onChange(next);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`h-8 shrink-0 rounded-[var(--radius)] border px-3 text-[10px] font-medium tracking-[0.14em] uppercase transition-colors ${
          active
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
        }`}
        title="Patterns joueurs & util"
      >
        Patterns{active ? ` · ${modeLabel}` : ""}
        {active && selectedName ? ` · ${selectedName.slice(0, 8)}` : ""}
      </button>
      {open && (
        <div className="absolute bottom-10 left-0 z-40 w-[22rem] space-y-3 border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Patterns</span>
            <button
              type="button"
              className="text-[var(--muted)] hover:text-[var(--text)]"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Joueurs
            </div>
            <div className="flex flex-wrap gap-1">
              {HEATMAP_MODES.filter((m) => m.group === "base").map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => onChange({ ...config, mode: m.value as HeatmapMode })}
                  className={`rounded-[var(--radius)] px-2.5 py-1 text-xs transition-colors ${
                    config.mode === m.value
                      ? "bg-[var(--text)] text-[var(--accent-ink)]"
                      : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Stuff / util
            </div>
            <div className="flex flex-wrap gap-1">
              {HEATMAP_MODES.filter((m) => m.group === "stuff").map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => onChange({ ...config, mode: m.value as HeatmapMode })}
                  className={`rounded-[var(--radius)] px-2.5 py-1 text-xs transition-colors ${
                    config.mode === m.value
                      ? "bg-[var(--text)] text-[var(--accent-ink)]"
                      : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--muted)]">
              Landing = où ça atterrit · Throws = d&apos;où c&apos;est jeté · arcs = trajet
            </p>
          </div>

          {utilActive && config.mode !== "throws" && (
            <label className="flex cursor-pointer items-center justify-between rounded px-1 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]">
              Afficher les arcs throw → land
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={config.showArcs}
                onChange={(e) => onChange({ ...config, showArcs: e.target.checked })}
              />
            </label>
          )}

          <div>
            <div className="mb-1.5 text-[10px] font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Side
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  { value: "", label: "Tous" },
                  { value: "CT", label: "CT" },
                  { value: "T", label: "T" },
                ] as { value: HeatmapSide; label: string }[]
              ).map((o) => (
                <button
                  key={o.value || "all"}
                  type="button"
                  onClick={() => setSide(o.value)}
                  className={`rounded-[var(--radius)] px-2.5 py-1 text-xs transition-colors ${
                    config.side === o.value
                      ? "bg-[var(--text)] text-[var(--accent-ink)]"
                      : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                  style={
                    o.value && config.side !== o.value
                      ? { color: SIDE_COLOR[o.value] }
                      : undefined
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              <span>Joueur</span>
              {config.steamId ? (
                <button
                  type="button"
                  className="normal-case tracking-normal text-[var(--muted)] hover:text-[var(--text)]"
                  onClick={() => onChange({ ...config, steamId: "" })}
                >
                  Tous
                </button>
              ) : null}
            </div>
            <div className="scrollbar-thin max-h-36 space-y-0.5 overflow-y-auto">
              <button
                type="button"
                onClick={() => onChange({ ...config, steamId: "" })}
                className={`flex w-full items-center rounded-[var(--radius)] px-2 py-1 text-left text-xs transition-colors ${
                  !config.steamId
                    ? "bg-[var(--text)] text-[var(--accent-ink)]"
                    : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                }`}
              >
                Tous les joueurs
              </button>
              {filteredPlayers.map((p) => (
                <button
                  key={p.steamId}
                  type="button"
                  onClick={() =>
                    onChange({ ...config, steamId: p.steamId, side: config.side || p.side })
                  }
                  className={`flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-1 text-left text-xs transition-colors ${
                    config.steamId === p.steamId
                      ? "bg-[var(--text)] text-[var(--accent-ink)]"
                      : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: SIDE_COLOR[p.side] }}
                  />
                  <span className="truncate tracking-[0.06em] uppercase">{p.name}</span>
                  <span className="ml-auto shrink-0 text-[9px] opacity-70">{p.side}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              <span>Intensité</span>
              <span className="tabular-nums">{Math.round(config.intensity * 100)}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              value={Math.round(config.intensity * 100)}
              onChange={(e) =>
                onChange({ ...config, intensity: Number(e.target.value) / 100 })
              }
              className="w-full accent-[var(--accent)]"
            />
          </div>

          <p className="border-t border-[var(--border)] pt-2 text-[11px] text-[var(--muted)]">
            {active ? (
              <>
                {roundCount} round{roundCount !== 1 ? "s" : ""}
                {pointCount != null ? ` · ${pointCount.toLocaleString("fr-FR")} pts` : ""}
                {arcCount ? ` · ${arcCount} arcs` : ""}
                {selectedName ? ` · ${selectedName}` : ""}
              </>
            ) : (
              <>Choisis un pattern (positions, morts, smokes…) sur les rounds filtrés.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
