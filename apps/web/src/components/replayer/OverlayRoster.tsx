"use client";

import type { Side } from "@skybox/shared";
import { SIDE_COLOR } from "./model";

export type OverlayPlayer = {
  steamId: string;
  name: string;
  side: Side;
  /** How many overlay layers this player appears in */
  appearances: number;
};

export function OverlayRoster({
  players,
  hidden,
  highlightedSteamId,
  onToggle,
  onSolo,
  onShowAll,
  onToggleSide,
}: {
  players: OverlayPlayer[];
  hidden: ReadonlySet<string>;
  highlightedSteamId?: string | null;
  onToggle: (steamId: string) => void;
  onSolo: (steamId: string) => void;
  onShowAll: () => void;
  onToggleSide: (side: Side) => void;
}) {
  const ct = players.filter((p) => p.side === "CT").sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const t = players.filter((p) => p.side === "T").sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const visible = players.filter((p) => !hidden.has(p.steamId)).length;
  const ctHidden = ct.length > 0 && ct.every((p) => hidden.has(p.steamId));
  const tHidden = t.length > 0 && t.every((p) => hidden.has(p.steamId));

  return (
    <div className="rounded-md border border-[var(--border)] bg-[#0f0f11]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div>
          <p className="text-[10px] font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
            Joueurs
          </p>
          <p className="text-[12px] font-semibold tracking-wide">
            {visible}/{players.length} visibles
          </p>
        </div>
        <button
          type="button"
          className="text-[10px] text-[var(--muted)] hover:text-[var(--text)]"
          onClick={onShowAll}
        >
          Tout afficher
        </button>
      </div>
      <div className="flex gap-1 border-b border-[var(--border)] px-3 py-1.5">
        <button
          type="button"
          className={`rounded-[var(--radius)] border px-2 py-0.5 text-[9px] tracking-wide uppercase transition-colors ${
            ctHidden
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-[var(--border)] hover:text-[var(--text)]"
          }`}
          onClick={() => onToggleSide("CT")}
          style={ctHidden ? undefined : { color: SIDE_COLOR.CT }}
        >
          {ctHidden ? "Show CT" : "Hide CT"}
        </button>
        <button
          type="button"
          className={`rounded-[var(--radius)] border px-2 py-0.5 text-[9px] tracking-wide uppercase transition-colors ${
            tHidden
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-[var(--border)] hover:text-[var(--text)]"
          }`}
          onClick={() => onToggleSide("T")}
          style={tHidden ? undefined : { color: SIDE_COLOR.T }}
        >
          {tHidden ? "Show T" : "Hide T"}
        </button>
      </div>
      <SideBlock
        side="CT"
        rows={ct}
        hidden={hidden}
        highlightedSteamId={highlightedSteamId}
        onToggle={onToggle}
        onSolo={onSolo}
      />
      <SideBlock
        side="T"
        rows={t}
        hidden={hidden}
        highlightedSteamId={highlightedSteamId}
        onToggle={onToggle}
        onSolo={onSolo}
      />
    </div>
  );
}

function SideBlock({
  side,
  rows,
  hidden,
  highlightedSteamId,
  onToggle,
  onSolo,
}: {
  side: Side;
  rows: OverlayPlayer[];
  hidden: ReadonlySet<string>;
  highlightedSteamId?: string | null;
  onToggle: (steamId: string) => void;
  onSolo: (steamId: string) => void;
}) {
  if (!rows.length) return null;
  const color = SIDE_COLOR[side];
  return (
    <div className="border-t border-[var(--border)] border-l-[2px]" style={{ borderLeftColor: color }}>
      <div className="px-3 py-1.5 text-[10px] font-medium tracking-[0.1em] uppercase" style={{ color }}>
        {side}
      </div>
      {rows.map((p) => {
        const on = !hidden.has(p.steamId);
        const highlighted = highlightedSteamId === p.steamId;
        return (
          <button
            key={p.steamId}
            type="button"
            onClick={() => onToggle(p.steamId)}
            onDoubleClick={(e) => {
              e.preventDefault();
              onSolo(p.steamId);
            }}
            title="Clic : afficher/masquer · Double-clic : seul ce joueur"
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[var(--bg-elevated)] ${
              on ? "" : "opacity-35"
            } ${
              highlighted
                ? "bg-[var(--bg-elevated)] ring-1 ring-inset ring-[var(--accent)]"
                : highlightedSteamId && on
                  ? "opacity-55"
                  : ""
            }`}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: on ? color : "transparent",
                boxShadow: `0 0 0 1px ${color}`,
              }}
            />
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-[0.08em] uppercase">
              {p.name}
            </span>
            {p.appearances > 1 && (
              <span className="shrink-0 text-[9px] tabular-nums text-[var(--muted)]">
                ×{p.appearances}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
