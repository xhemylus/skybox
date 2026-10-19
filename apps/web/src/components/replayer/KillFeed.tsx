"use client";

import type { ReplayData, ReplayRound } from "@skybox/shared";
import { HeadshotIcon } from "./icons";
import { SIDE_COLOR, killWeapon } from "./model";

const VISIBLE_SECONDS = 6;

export function KillFeed({ replay, round, tick }: { replay: ReplayData; round: ReplayRound; tick: number }) {
  const recent = round.kills.filter((k) => k.tick <= tick && tick - k.tick < VISIBLE_SECONDS * replay.tickRate);
  if (!recent.length) return null;
  const color = (idx: number | null) => (idx == null ? "#a1a1aa" : SIDE_COLOR[round.sideOf[replay.players[idx].team]]);

  return (
    <div className="pointer-events-none flex flex-col items-end gap-1">
      {recent.slice(-6).map((k, i) => (
        <div
          key={`${k.tick}-${i}`}
          className="flex items-center gap-1.5 rounded bg-black/75 px-2 py-1 text-[11px] font-semibold"
        >
          {k.attacker != null && <span style={{ color: color(k.attacker) }}>{replay.players[k.attacker].name}</span>}
          {k.assister != null && (
            <span className="text-[var(--muted)]">
              + <span style={{ color: color(k.assister) }}>{replay.players[k.assister].name}</span>
            </span>
          )}
          <span className="rounded bg-white/10 px-1 text-[10px] text-[#d4d4d8]">{killWeapon(k.weapon)}</span>
          {k.wallbang && <span className="text-[9px] text-[var(--muted)]">WB</span>}
          {k.throughSmoke && <span className="text-[9px] text-[var(--muted)]">SMOKE</span>}
          {k.noscope && <span className="text-[9px] text-[var(--muted)]">NS</span>}
          {k.headshot && <HeadshotIcon size={11} />}
          <span style={{ color: color(k.victim) }}>{replay.players[k.victim].name}</span>
        </div>
      ))}
    </div>
  );
}
