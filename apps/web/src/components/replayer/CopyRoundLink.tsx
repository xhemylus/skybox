"use client";

import { useState } from "react";
import { buildRoundShareUrl } from "./shareUrl";
import type { RoundFilter } from "./model";

export function CopyRoundLink({
  shareCode,
  mapName,
  round,
  t,
  filter,
  className,
}: {
  shareCode: string;
  mapName?: string | null;
  round: number;
  /** Seconds after freeze end. */
  t?: number;
  filter?: RoundFilter;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = buildRoundShareUrl({ shareCode, mapName }, { round, t, filter });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copie ce lien :", url);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copier le lien de ce round (pour Discord)"
      className={
        className ??
        `pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] border px-2.5 text-[12px] tracking-wide transition-colors ${
          copied
            ? "border-[var(--accent)] text-[var(--accent)]"
            : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
        }`
      }
    >
      {copied ? "Copié ✓" : "Lien round"}
    </button>
  );
}
