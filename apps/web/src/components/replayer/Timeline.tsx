"use client";

import { useRef, useState } from "react";
import type { ReplayData, ReplayRound } from "@skybox/shared";
import { SIDE_COLOR, formatClock, roundClock, SPEEDS } from "./model";

export function Timeline({
  replay,
  round,
  from,
  to,
  tick,
  playing,
  speed,
  clockOverride,
  onSeek,
  onTogglePlay,
  onSpeed,
}: {
  replay: ReplayData;
  /** null in multi-round mode: no per-round markers */
  round: ReplayRound | null;
  from: number;
  to: number;
  tick: number;
  playing: boolean;
  speed: number;
  clockOverride?: string;
  onSeek: (tick: number) => void;
  onTogglePlay: () => void;
  onSpeed: (s: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const span = Math.max(1, to - from);
  const pct = (t: number) => `${(Math.min(Math.max(t - from, 0), span) / span) * 100}%`;
  const clock = round ? roundClock(round, tick, replay.tickRate) : null;

  function tickAt(clientX: number) {
    const rect = trackRef.current!.getBoundingClientRect();
    return from + Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * span;
  }

  const gridStep = 10 * replay.tickRate;
  const grid: number[] = [];
  const gridStart = round ? round.freezeEndTick : from;
  for (let t = gridStart + gridStep; t < to; t += gridStep) grid.push(t);

  const sideOf = (idx: number | null) => (round && idx != null ? round.sideOf[replay.players[idx].team] : null);
  const bombEnd = round
    ? (round.bomb.defuseTick ?? round.bomb.explodeTick ?? round.endTick)
    : 0;

  return (
    <div className="flex h-11 items-stretch overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
      <button
        onClick={onTogglePlay}
        className="relative flex w-14 shrink-0 items-center justify-center border-r border-[var(--border)] hover:bg-[var(--bg-hover)]"
        title="Lecture / pause (Espace)"
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3.5" y="2.5" width="3" height="11" rx=".5" />
            <rect x="9.5" y="2.5" width="3" height="11" rx=".5" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2.5v11l9-5.5-9-5.5z" />
          </svg>
        )}
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]);
          }}
          className="absolute top-1 right-1 rounded bg-[#26262b] px-1 text-[9px] font-bold text-[var(--muted)] hover:text-[var(--text)]"
          title="Vitesse (+ / -)"
        >
          {speed}x
        </span>
      </button>
      <div className="flex w-20 shrink-0 items-center justify-center gap-1.5 border-r border-[var(--border)] text-[15px] font-semibold tabular-nums">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-[var(--muted)]">
          <circle cx="8" cy="9" r="5.5" />
          <path d="M8 6v3l2 1.5M6.5 1.5h3" strokeLinecap="round" />
        </svg>
        <span
          className={
            clock?.phase === "bomb" ? "text-[var(--danger)]" : clock?.phase === "freeze" ? "text-[var(--muted)]" : ""
          }
        >
          {clockOverride ?? clock?.text ?? "0:00"}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative flex-1 cursor-pointer touch-none select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onSeek(tickAt(e.clientX));
        }}
        onPointerMove={(e) => {
          setHover(tickAt(e.clientX));
          if (e.buttons === 1) onSeek(tickAt(e.clientX));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {round && (
          <>
            <div
              className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,#17171a_0_4px,#121214_4px_8px)]"
              style={{ width: pct(round.freezeEndTick) }}
            />
            {round.bomb.plantTick != null && (
              <div
                className="absolute inset-y-0 flex items-center bg-[rgba(220,38,38,0.28)] pl-2 text-[11px] font-semibold text-[#f87171]"
                style={{ left: pct(round.bomb.plantTick), width: `calc(${pct(bombEnd)} - ${pct(round.bomb.plantTick)})` }}
              >
                Bomb {round.bomb.site ?? ""}
              </div>
            )}
            <div className="absolute inset-y-0 right-0 bg-[rgba(0,0,0,0.35)]" style={{ left: pct(round.endTick) }} />
          </>
        )}
        {grid.map((t) => (
          <div key={t} className="absolute inset-y-2 w-px border-l border-dashed border-[#2a2a30]" style={{ left: pct(t) }} />
        ))}
        {round?.util.map((u, i) => {
          const side = sideOf(u.thrower);
          return (
            <div
              key={`u${i}`}
              className="absolute bottom-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
              style={{ left: pct(u.startTick), background: side ? SIDE_COLOR[side] : "#777", opacity: 0.8 }}
            />
          );
        })}
        {round?.kills.map((k, i) => {
          const side = sideOf(k.attacker) ?? "T";
          return (
            <div key={`k${i}`} className="absolute inset-y-0" style={{ left: pct(k.tick) }}>
              <div className="absolute inset-y-1 w-px" style={{ background: SIDE_COLOR[side], opacity: 0.85 }} />
              <div
                className="absolute top-0.5 h-0 w-0 -translate-x-1/2 border-x-[4px] border-t-[5px] border-x-transparent"
                style={{ borderTopColor: SIDE_COLOR[side] }}
              />
            </div>
          );
        })}
        {hover != null && (
          <div className="pointer-events-none absolute inset-y-0 w-px bg-white/25" style={{ left: pct(hover) }}>
            <span className="absolute -top-0 left-1 rounded bg-black/80 px-1 text-[10px] tabular-nums">
              {formatClock((hover - (round?.freezeEndTick ?? from)) / replay.tickRate)}
            </span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-y-0" style={{ left: pct(tick) }}>
          <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white" />
          <div className="absolute top-1/2 h-3.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black bg-white" />
        </div>
      </div>
    </div>
  );
}
