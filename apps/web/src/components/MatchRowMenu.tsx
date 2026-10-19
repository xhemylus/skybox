"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW = 180;
    const approxH = canManage ? 180 : 48;
    let top = r.bottom + 6;
    let left = r.right - menuW;
    if (left < 8) left = 8;
    if (top + approxH > window.innerHeight - 8) {
      top = Math.max(8, r.top - approxH - 6);
    }
    setPos({ top, left });
  }, [open, canManage]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onClose() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [open]);

  const itemClass =
    "block w-full rounded-[var(--radius)] px-3 py-2 text-left text-sm text-[var(--text)] transition-colors hover:bg-[var(--bg-hover)]";

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 80 }}
            className="min-w-[11rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
          >
            {parseStatus === "ready" && (
              <Link
                href={`/m/${matchId}/stats`}
                role="menuitem"
                className={itemClass}
                onClick={() => setOpen(false)}
              >
                Stats
              </Link>
            )}
            {canManage && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  onClick={() => {
                    setOpen(false);
                    onMeta();
                  }}
                >
                  Éditer meta
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${itemClass} disabled:opacity-40`}
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
                  role="menuitem"
                  className={`${itemClass} text-[var(--danger)]`}
                  onClick={() => {
                    setOpen(false);
                    onRemove();
                  }}
                >
                  Supprimer
                </button>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost h-8 w-8 px-0"
        aria-label="Plus d'actions"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {menu}
    </>
  );
}
