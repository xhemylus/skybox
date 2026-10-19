"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type MenuItem =
  | { kind: "link"; key: string; href: string; label: string; danger?: boolean }
  | { kind: "button"; key: string; label: string; onSelect: () => void; danger?: boolean; disabled?: boolean };

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
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items: MenuItem[] = [];
  if (parseStatus === "ready") {
    items.push({ kind: "link", key: "replay", href: `/m/${matchId}`, label: "Ouvrir le replay" });
    items.push({ kind: "link", key: "stats", href: `/m/${matchId}/stats`, label: "Stats" });
  }
  if (canManage) {
    items.push({
      kind: "button",
      key: "meta",
      label: "Éditer meta",
      onSelect: onMeta,
    });
    items.push({
      kind: "button",
      key: "reparse",
      label: parseStatus === "failed" ? "Relancer l'analyse" : "Re-analyser",
      onSelect: onReparse,
      disabled: parseStatus === "processing",
    });
    items.push({
      kind: "button",
      key: "remove",
      label: "Supprimer",
      onSelect: onRemove,
      danger: true,
    });
  }

  useEffect(() => {
    if (!open) return;

    placeMenu();

    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }

    // Pas de capture scroll : ça fermait le menu dès l'ouverture dans le dashboard overflow.
    window.addEventListener("resize", placeMenu);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", placeMenu);
      document.removeEventListener("pointerdown", onPointerDown);
    };
    // items.length only — labels don't affect placement
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length]);

  function placeMenu() {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const menuW = 200;
    const menuH = Math.max(44, items.length * 40 + 8);
    let top = r.bottom + 6;
    let left = Math.min(r.right - menuW, window.innerWidth - menuW - 8);
    if (left < 8) left = 8;
    if (top + menuH > window.innerHeight - 8) {
      top = Math.max(8, r.top - menuH - 6);
    }
    setCoords({ top, left });
  }

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost h-8 w-8 px-0"
        aria-label="Plus d'actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => {
            const next = !v;
            if (next) placeMenu();
            return next;
          });
        }}
      >
        ⋯
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 9999,
              minWidth: 200,
              padding: 4,
              background: "#141416",
              color: "#f0ebe3",
              border: "1px solid #34343a",
              borderRadius: 4,
              boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
            }}
          >
            {items.map((item) =>
              item.kind === "link" ? (
                <Link
                  key={item.key}
                  role="menuitem"
                  href={item.href}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 4,
                    fontSize: 14,
                    color: "#f0ebe3",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#1a1a1d";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 4,
                    border: 0,
                    background: "transparent",
                    fontSize: 14,
                    textAlign: "left",
                    cursor: item.disabled ? "not-allowed" : "pointer",
                    opacity: item.disabled ? 0.4 : 1,
                    color: item.danger ? "#c97070" : "#f0ebe3",
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled) e.currentTarget.style.background = "#1a1a1d";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
