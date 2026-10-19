"use client";

import { useState } from "react";
import type { DrawShape, Tool } from "./MapCanvas";
import type { Settings } from "./model";

const COLORS = ["#c9b896", "#f0ebe3", "#c97070", "#d0a56a", "#7aa3c7", "#a89472"];
const SHAPES: { value: DrawShape; label: string }[] = [
  { value: "free", label: "Libre" },
  { value: "line", label: "Ligne" },
  { value: "arrow", label: "Flèche" },
  { value: "circle", label: "Cercle" },
];

const SHORTCUTS: [string, string][] = [
  ["Espace", "Lecture / pause"],
  ["← / →", "Reculer / avancer de 5 s"],
  ["↑ / ↓  ou  Maj + ← / →", "Round précédent / suivant"],
  ["+ / -", "Vitesse"],
  ["H", "Outil main (déplacer, molette = zoom)"],
  ["D", "Outil dessin"],
  ["Suppr", "Effacer les dessins du round"],
  ["M", "Multi round"],
  ["N", "Afficher / masquer les noms"],
  ["0", "Recentrer la carte"],
  ["Échap", "Retirer le focus joueur"],
];

export function Toolbar({
  tool,
  onTool,
  drawColor,
  onDrawColor,
  drawShape,
  onDrawShape,
  onClear,
  settings,
  onSettings,
  saveState,
}: {
  tool: Tool;
  onTool: (t: Tool) => void;
  drawColor: string;
  onDrawColor: (c: string) => void;
  drawShape: DrawShape;
  onDrawShape: (s: DrawShape) => void;
  onClear: () => void;
  settings: Settings;
  onSettings: (s: Settings) => void;
  saveState: "idle" | "saving" | "saved" | "error";
}) {
  const [open, setOpen] = useState<"settings" | "keys" | null>(null);
  const toggle = (k: "settings" | "keys") => setOpen((o) => (o === k ? null : k));

  return (
    <div className="relative flex items-center gap-1">
      <button className="icon-btn" data-active={open === "settings"} onClick={() => toggle("settings")} title="Réglages">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="2.2" />
          <path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4" strokeLinecap="round" />
        </svg>
      </button>
      <button className="icon-btn" data-active={open === "keys"} onClick={() => toggle("keys")} title="Raccourcis clavier">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
          <path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6" strokeLinecap="round" />
        </svg>
      </button>
      <button className="icon-btn" data-active={tool === "pan"} onClick={() => onTool("pan")} title="Main (H)">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M5.5 8V3.25a1 1 0 012 0V7.5M7.5 7V2.25a1 1 0 012 0V7.5M9.5 7.5V3.25a1 1 0 012 0V9.5c0 2.75-1.75 4.75-4.25 4.75S3.5 12.5 2.75 11L1.9 9.1a1 1 0 011.7-1l1.9 1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button className="icon-btn" data-active={tool === "draw"} onClick={() => onTool("draw")} title="Dessin (D)">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M11 2.5l2.5 2.5L6 12.5H3.5V10L11 2.5z" strokeLinejoin="round" />
        </svg>
      </button>
      <button className="icon-btn" onClick={onClear} title="Effacer les dessins du round (Suppr)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" strokeLinecap="round" />
        </svg>
      </button>

      {tool === "draw" && (
        <div className="ml-1 flex items-center gap-1 rounded-md border border-[var(--border)] bg-[#0d0d0d]/95 px-2 py-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onDrawColor(c)}
              className={`h-4 w-4 rounded-full border-2 ${drawColor === c ? "border-white" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-[var(--border)]" />
          {SHAPES.map((s) => (
            <button
              key={s.value}
              onClick={() => onDrawShape(s.value)}
              className={`rounded px-1.5 text-[11px] ${drawShape === s.value ? "bg-[var(--text)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      {saveState !== "idle" && (
        <span className={`ml-2 text-[11px] ${saveState === "error" ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>
          {saveState === "saving" ? "Enregistrement…" : saveState === "saved" ? "Dessins enregistrés" : "Échec de l'enregistrement"}
        </span>
      )}

      {open === "settings" && (
        <div className="absolute bottom-10 left-0 z-40 w-64 space-y-1 border border-[var(--border)] bg-[var(--bg-elevated)] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          {(
            [
              ["showNames", "Noms des joueurs"],
              ["showTrails", "Trajectoires des grenades"],
              ["showKills", "Marqueurs de kills"],
              ["colorRadar", "Radar en couleur"],
              ["autoNext", "Enchaîner les rounds"],
            ] as [keyof Settings, string][]
          ).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-[var(--bg-hover)]">
              {label}
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={settings[key]}
                onChange={(e) => onSettings({ ...settings, [key]: e.target.checked })}
              />
            </label>
          ))}
        </div>
      )}
      {open === "keys" && (
        <div className="absolute bottom-10 left-0 z-40 w-80 border border-[var(--border)] bg-[var(--bg-elevated)] p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
          <div className="mb-2 text-sm font-semibold">Raccourcis clavier</div>
          <table className="w-full text-xs">
            <tbody>
              {SHORTCUTS.map(([k, v]) => (
                <tr key={k}>
                  <td className="py-1 pr-3 font-mono whitespace-nowrap text-[var(--text)]">{k}</td>
                  <td className="py-1 text-[var(--muted)]">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
