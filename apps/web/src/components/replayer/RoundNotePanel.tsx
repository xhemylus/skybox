"use client";

import { CopyRoundLink } from "./CopyRoundLink";
import type { RoundFilter } from "./model";

type SaveState = "idle" | "saving" | "saved" | "error";

export function RoundNotePanel({
  shareCode,
  mapName,
  roundNumber,
  t,
  filter,
  value,
  onChange,
  saveState,
  authorName,
}: {
  shareCode: string;
  mapName?: string | null;
  roundNumber: number;
  /** Seconds after freeze end for the share link. */
  t?: number;
  filter?: RoundFilter;
  value: string;
  onChange: (body: string) => void;
  saveState: SaveState;
  authorName?: string | null;
}) {
  const status =
    saveState === "saving"
      ? "Enregistrement…"
      : saveState === "saved"
        ? "Enregistré"
        : saveState === "error"
          ? "Erreur"
          : authorName
            ? `Dernière edit · ${authorName}`
            : "Autosave";

  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div>
          <p className="section-label">Note</p>
          <p className="text-[13px] font-medium tracking-wide">Round {roundNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <CopyRoundLink
            shareCode={shareCode}
            mapName={mapName}
            round={roundNumber}
            t={t}
            filter={filter}
            className="h-7 rounded-[var(--radius)] border border-[var(--border)] px-2 text-[11px] text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          />
          <span
            className={`text-[10px] tracking-wide ${
              saveState === "error" ? "text-[var(--danger)]" : "text-[var(--muted)]"
            }`}
          >
            {status}
          </span>
        </div>
      </div>
      <textarea
        className="input min-h-[96px] resize-y rounded-none border-0 bg-transparent text-[13px] leading-relaxed focus:ring-0"
        placeholder="Ex. trop large A · flash trop tôt · default mid…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={4000}
      />
    </div>
  );
}
