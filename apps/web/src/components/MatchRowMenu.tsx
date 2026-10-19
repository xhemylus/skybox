"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function MatchRowMenu({
  matchId,
  parseStatus,
  canManage,
  onMeta,
  onReparse,
  onRemove,
}: {
  matchId: string;
  parseStatus: string;
  canManage: boolean;
  onMeta: () => void;
  onReparse: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost h-8 w-8 px-0"
        aria-label="Plus d'actions"
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div className="absolute top-9 right-0 z-40 min-w-[10.5rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
          {parseStatus === "ready" && (
            <Link
              href={`/m/${matchId}/stats`}
              className="block rounded-[var(--radius)] px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              onClick={() => setOpen(false)}
            >
              Stats
            </Link>
          )}
          {canManage && (
            <>
              <button
                type="button"
                className="block w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm text-[var(--muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                onClick={() => {
                  setOpen(false);
                  onMeta();
                }}
              >
                Éditer meta
              </button>
              <button
                type="button"
                className="block w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm text-[var(--muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-40"
                disabled={parseStatus === "processing"}
                onClick={() => {
                  setOpen(false);
                  onReparse();
                }}
              >
                {parseStatus === "failed" ? "Relancer l'analyse" : "Re-analyser"}
              </button>
              <button
                type="button"
                className="block w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm text-[var(--danger)] transition-colors hover:bg-[var(--bg-hover)]"
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
              >
                Supprimer
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
