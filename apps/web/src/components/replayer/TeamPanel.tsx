"use client";

import type { ReplayData, ReplayRound, TeamKey } from "@skybox/shared";
import { C4Icon, GrenadeIcon, HelmetIcon, KitIcon, SkullIcon } from "./icons";
import { SIDE_COLOR, displayedScore, grenadesOf, playerStateAt } from "./model";

export function TeamPanel({
  replay,
  round,
  tick,
  team,
  focus,
  onFocus,
}: {
  replay: ReplayData;
  round: ReplayRound;
  tick: number;
  team: TeamKey;
  focus: number | null;
  onFocus: (idx: number | null) => void;
}) {
  const side = round.sideOf[team];
  const color = SIDE_COLOR[side];
  const name = replay.teams.find((t) => t.key === team)?.name ?? team;
  const roundKills = new Map<number, number>();
  for (const k of round.kills) {
    if (k.tick > tick || k.attacker == null) continue;
    if (replay.players[k.attacker].team === replay.players[k.victim].team) continue;
    roundKills.set(k.attacker, (roundKills.get(k.attacker) ?? 0) + 1);
  }

  const rows = replay.players
    .map((p, idx) => ({ p, idx, st: playerStateAt(replay, round, idx, tick) }))
    .filter((r) => r.p.team === team && r.st);

  return (
    <div
      className="overflow-hidden border border-[var(--border)] border-l-[2px] bg-[var(--bg)]"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <span className="truncate text-[12px] font-medium tracking-[0.06em]">{name}</span>
        <span className="font-display text-[1.35rem] leading-none tabular-nums" style={{ color }}>
          {displayedScore(round, team, tick)}
        </span>
      </div>
      <div>
        {rows.map(({ p, idx, st }) => {
          const s = st!;
          const grenades = grenadesOf(s.inventory);
          const kills = roundKills.get(idx) ?? 0;
          const focused = focus === idx;
          return (
            <button
              key={p.steamId}
              onClick={() => onFocus(focused ? null : idx)}
              className={`block w-full px-3.5 py-2 text-left transition-colors ${
                focused ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-elevated)]"
              } ${s.alive ? "" : "opacity-40"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {!s.alive && <SkullIcon size={11} />}
                  <span className="truncate text-[11px] font-medium tracking-[0.1em] uppercase">{p.name}</span>
                  {kills > 0 && (
                    <span className="text-[9px] font-medium text-[var(--muted)]">{kills}K</span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                  ${s.money.toLocaleString("en-US")}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-px flex-1 overflow-hidden bg-[var(--border)]">
                  <div
                    className="h-full transition-[width] duration-150"
                    style={{ width: `${s.hp}%`, background: color }}
                  />
                </div>
                <span className="w-7 text-right text-[11px] font-semibold tabular-nums" style={{ color }}>
                  {s.hp}
                </span>
                <span className="flex items-center gap-0.5">
                  {s.armor > 0 && <HelmetIcon helmet={s.helmet} size={11} />}
                  {s.defuser && <KitIcon size={11} />}
                  {s.c4 && <C4Icon size={11} />}
                  {grenades.map((g, i) => (
                    <GrenadeIcon key={i} kind={g} size={11} />
                  ))}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
