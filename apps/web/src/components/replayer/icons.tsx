import type { GrenadeKind } from "./model";

type P = { className?: string; size?: number };

export function GrenadeIcon({ kind, size = 12 }: { kind: GrenadeKind; size?: number }) {
  const color = { smoke: "#a1a1aa", flash: "#f4f4f5", he: "#ef4444", molotov: "#f97316", decoy: "#71717a" }[kind];
  if (kind === "molotov") {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" aria-label="molotov">
        <path d="M6 1c.3 1.8 2.8 2.9 2.8 5.6A2.8 2.8 0 016 9.5a2.8 2.8 0 01-2.8-2.9c0-1.4.8-2 1.3-2.9.3.8.7 1.1 1.1 1.2C5.5 3.7 5.6 2.2 6 1z" fill={color} />
      </svg>
    );
  }
  if (kind === "flash") {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" aria-label="flash">
        <path d="M6.8 1L3 6.6h2.6L5 11l4-5.8H6.3L6.8 1z" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-label={kind}>
      <rect x="4.75" y="1" width="2.5" height="2" rx=".5" fill={color} />
      <rect x="3" y="3" width="6" height="8" rx={kind === "smoke" ? 1.2 : 3} fill={color} />
    </svg>
  );
}

export function KitIcon({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-label="defuse kit">
      <path d="M2.5 4.5h7v5a1 1 0 01-1 1h-5a1 1 0 01-1-1v-5zM4 4.5V3a2 2 0 014 0v1.5" fill="none" stroke="#7aa3c7" strokeWidth="1.3" />
    </svg>
  );
}

export function HelmetIcon({ size = 12, helmet }: P & { helmet: boolean }) {
  return helmet ? (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-label="kevlar + helmet">
      <path d="M2 7.5a4 4 0 018 0V9H2V7.5z" fill="#d4d4d8" />
      <path d="M1.5 9h9" stroke="#d4d4d8" strokeWidth="1.2" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-label="kevlar">
      <path d="M6 1.5l4 1.5v3c0 2.4-1.7 4-4 4.8C3.7 10 2 8.4 2 6V3l4-1.5z" fill="#a1a1aa" />
    </svg>
  );
}

export function C4Icon({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-label="C4">
      <rect x="1.5" y="3" width="9" height="6.5" rx="1" fill="#dc2626" />
      <rect x="3" y="4.5" width="4" height="2" fill="#450a0a" />
    </svg>
  );
}

export function SkullIcon({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-label="dead">
      <path d="M6 1.5a4 4 0 00-4 4c0 1.4.7 2.3 1.5 2.9V10h5V8.4c.8-.6 1.5-1.5 1.5-2.9a4 4 0 00-4-4z" fill="#71717a" />
      <circle cx="4.5" cy="5.6" r="1" fill="#111" />
      <circle cx="7.5" cy="5.6" r="1" fill="#111" />
    </svg>
  );
}

export function HeadshotIcon({ size = 12 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-label="headshot">
      <circle cx="6" cy="6" r="4" fill="none" stroke="#f4f4f5" strokeWidth="1.2" />
      <circle cx="6" cy="6" r="1.4" fill="#ef4444" />
    </svg>
  );
}
