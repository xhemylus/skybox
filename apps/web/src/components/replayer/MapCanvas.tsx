"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  RADAR_SIZE,
  hasLowerLevel,
  normalizeMapName,
  radarUnits,
  worldToRadar,
  type PaintStroke,
  type ReplayData,
  type ReplayRound,
  type UtilType,
} from "@skybox/shared";
import type { UtilArc } from "./heatmap";
import { SIDE_COLOR, playerStateAt, type Settings } from "./model";

export type Layer = {
  round: ReplayRound;
  tick: number;
  label?: string;
  /** When set, players/util come from this replay (cross-match overlay). */
  data?: ReplayData;
  /** Match id for overlay highlight / hit-testing. */
  matchId?: string;
};

export type OverlayFocus = { steamId: string; matchId: string };
export type View = { zoom: number; panX: number; panY: number };
export type Tool = "pan" | "draw";
export type DrawShape = PaintStroke["tool"];

const UTIL_COLOR: Record<UtilType, string> = {
  smoke: "#d4d4d8",
  flash: "#fef9c3",
  he: "#ef4444",
  molotov: "#f97316",
  decoy: "#a1a1aa",
};

const SMOKE_RADIUS = 144;
const FIRE_RADIUS = 110;

export function MapCanvas({
  replay,
  layers,
  view,
  onViewChange,
  tool,
  drawColor,
  drawShape,
  strokes,
  roundNumber,
  onStrokeAdd,
  focus,
  onFocus,
  settings,
  hiddenSteamIds,
  overlayFocus,
  onOverlayFocus,
  heatmapImage,
  utilArcs,
}: {
  replay: ReplayData;
  layers: Layer[];
  view: View;
  onViewChange: (v: View) => void;
  tool: Tool;
  drawColor: string;
  drawShape: DrawShape;
  strokes: PaintStroke[];
  roundNumber: number | null;
  onStrokeAdd: (s: PaintStroke) => void;
  focus: number | null;
  onFocus: (idx: number | null) => void;
  settings: Settings;
  /** Steam IDs to hide on the radar (overlay toggles). */
  hiddenSteamIds?: ReadonlySet<string>;
  /** Radar highlight: player + match (does not hide). */
  overlayFocus?: OverlayFocus | null;
  onOverlayFocus?: (focus: OverlayFocus | null) => void;
  /** Pre-rendered heatmap at radar pixel size (incl. lower level width). */
  heatmapImage?: HTMLCanvasElement | null;
  /** Aggregated util throw→land arcs (patterns). */
  utilArcs?: UtilArc[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [images, setImages] = useState<{ main?: HTMLImageElement; lower?: HTMLImageElement }>({});
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const draft = useRef<PaintStroke | null>(null);
  const [, forceRender] = useState(0);
  const map = normalizeMapName(replay.map);
  const lower = hasLowerLevel(map);
  const worldW = lower ? RADAR_SIZE * 2 : RADAR_SIZE;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const load = (src: string) =>
      new Promise<HTMLImageElement | undefined>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(undefined);
        img.src = src;
      });
    Promise.all([
      load(`/maps/${map}.png`),
      lower ? load(`/maps/${map}_lower.png`) : Promise.resolve(undefined),
    ]).then(([main, low]) => setImages({ main, lower: low }));
  }, [map, lower]);

  function transform() {
    const fit = Math.min(size.w / worldW, size.h / RADAR_SIZE) * 0.96;
    const scale = fit * view.zoom;
    return {
      scale,
      ox: size.w / 2 - (worldW * scale) / 2 + view.panX,
      oy: size.h / 2 - (RADAR_SIZE * scale) / 2 + view.panY,
    };
  }

  function toWorld(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { scale, ox, oy } = transform();
    return { x: (clientX - rect.left - ox) / scale, y: (clientY - rect.top - oy) / scale };
  }

  // ---------- render ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size.w * dpr)) canvas.width = Math.round(size.w * dpr);
    if (canvas.height !== Math.round(size.h * dpr)) canvas.height = Math.round(size.h * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const { scale, ox, oy } = transform();
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    const px = (screenPx: number) => screenPx / scale;
    const marker = Math.min(Math.max(Math.sqrt(view.zoom), 0.85), 1.6);

    // Radar
    ctx.filter = settings.colorRadar ? "none" : "grayscale(1) brightness(0.62) contrast(1.15)";
    if (images.main) ctx.drawImage(images.main, 0, 0, RADAR_SIZE, RADAR_SIZE);
    if (images.lower) ctx.drawImage(images.lower, RADAR_SIZE, 0, RADAR_SIZE, RADAR_SIZE);
    ctx.filter = "none";

    if (heatmapImage) {
      ctx.drawImage(heatmapImage, 0, 0);
    }

    // Pattern arcs (throw → land) across filtered rounds
    if (utilArcs?.length) {
      for (const arc of utilArcs) {
        const a = worldToRadar(map, arc.x0, arc.y0, arc.z0);
        const b = worldToRadar(map, arc.x1, arc.y1, arc.z1);
        const color = UTIL_COLOR[arc.type] ?? "#fff";
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = px(1.5);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        // slight curve toward mid
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * 0.12;
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(a.x, a.y, px(2.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.x, b.y, px(3.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const multi = layers.length > 1;

    const hidden = hiddenSteamIds;
    const isHidden = (idx: number | null, data: ReplayData) =>
      idx != null && hidden != null && hidden.has(data.players[idx]?.steamId);

    for (const layer of layers) {
      const { round, tick } = layer;
      const data = layer.data ?? replay;
      const sideOfPlayer = (idx: number | null) =>
        idx == null ? null : round.sideOf[data.players[idx].team];
      const layerDim =
        overlayFocus && layer.matchId && layer.matchId !== overlayFocus.matchId ? 0.25 : 1;

      // Utility areas
      for (const u of round.util) {
        if (tick < u.startTick || tick > u.endTick) continue;
        if (isHidden(u.thrower, data)) continue;
        const p = worldToRadar(map, u.x, u.y, u.z);
        const life = (tick - u.startTick) / Math.max(1, u.endTick - u.startTick);
        const remaining = (u.endTick - tick) / data.tickRate;
        const side = sideOfPlayer(u.thrower);
        if (u.type === "smoke") {
          const r = radarUnits(map, SMOKE_RADIUS) * Math.min(1, life * 12 + 0.3);
          ctx.globalAlpha = (remaining < 2 ? Math.max(0.15, remaining / 2) : 1) * layerDim;
          ctx.fillStyle = "rgba(190,190,198,0.62)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = side ? SIDE_COLOR[side] : "#999";
          ctx.lineWidth = px(1.5);
          ctx.stroke();
          ctx.fillStyle = "#111";
          ctx.font = `600 ${px(10 * marker)}px ui-sans-serif, system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(Math.ceil(remaining)), p.x, p.y);
          ctx.globalAlpha = 1;
        } else if (u.type === "molotov") {
          const r = radarUnits(map, FIRE_RADIUS) * Math.min(1, life * 8 + 0.4);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, "rgba(255,170,60,0.75)");
          g.addColorStop(1, "rgba(239,68,68,0.25)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const r = px(6 + life * 22) * marker;
          ctx.globalAlpha = 1 - life;
          ctx.strokeStyle = UTIL_COLOR[u.type];
          ctx.fillStyle = u.type === "flash" ? "rgba(255,255,230,0.5)" : "rgba(239,68,68,0.35)";
          ctx.lineWidth = px(2);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Grenades in flight
      for (const g of round.paths) {
        const endTick = g.startTick + (g.xs.length - 1) * g.step;
        if (tick < g.startTick || tick > endTick) continue;
        if (isHidden(g.thrower, data)) continue;
        const n = Math.min(g.xs.length - 1, Math.floor((tick - g.startTick) / g.step));
        if (settings.showTrails) {
          ctx.strokeStyle = UTIL_COLOR[g.type];
          ctx.globalAlpha = 0.55;
          ctx.lineWidth = px(1.25);
          ctx.setLineDash([px(3), px(3)]);
          ctx.beginPath();
          for (let i = 0; i <= n; i++) {
            const p = worldToRadar(map, g.xs[i], g.ys[i]);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        const head = worldToRadar(map, g.xs[n], g.ys[n]);
        ctx.fillStyle = UTIL_COLOR[g.type];
        ctx.strokeStyle = "#000";
        ctx.lineWidth = px(1);
        ctx.beginPath();
        ctx.arc(head.x, head.y, px(3.2 * marker), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Bomb
      const b = round.bomb;
      if (b.plantTick != null && b.plantX != null && b.plantY != null && tick >= b.plantTick) {
        const p = worldToRadar(map, b.plantX, b.plantY);
        const resolved = (b.defuseTick != null && tick >= b.defuseTick) || (b.explodeTick != null && tick >= b.explodeTick);
        if (b.explodeTick != null && tick >= b.explodeTick && tick < b.explodeTick + data.tickRate * 2) {
          const t = (tick - b.explodeTick) / (data.tickRate * 2);
          ctx.fillStyle = `rgba(239,68,68,${0.5 * (1 - t)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radarUnits(map, 500) * (0.4 + t), 0, Math.PI * 2);
          ctx.fill();
        }
        const pulse = resolved ? 0 : (Math.sin(tick / 6) + 1) / 2;
        ctx.fillStyle = resolved && b.defuseTick != null ? "#4c9aff" : "#ef4444";
        ctx.globalAlpha = 0.25 + pulse * 0.35;
        ctx.beginPath();
        ctx.arc(p.x, p.y, px(11 * marker), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        drawC4(ctx, p.x, p.y, px(7 * marker));
      }

      // Kills
      if (settings.showKills) {
        for (const k of round.kills) {
          if (k.tick > tick) continue;
          if (isHidden(k.victim, data) && isHidden(k.attacker, data)) continue;
          if (isHidden(k.victim, data)) continue;
          const p = worldToRadar(map, k.victimX, k.victimY, k.victimZ);
          const side = sideOfPlayer(k.victim)!;
          const age = (tick - k.tick) / data.tickRate;
          if (age < 1.5 && k.attackerX != null && k.attackerY != null && !isHidden(k.attacker, data)) {
            const a = worldToRadar(map, k.attackerX, k.attackerY, k.victimZ);
            ctx.strokeStyle = "#ffffff";
            ctx.globalAlpha = 0.7 * (1 - age / 1.5);
            ctx.lineWidth = px(1.25);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
          const s = px(4.5 * marker);
          ctx.strokeStyle = SIDE_COLOR[side];
          let killAlpha = 0.9;
          if (overlayFocus && layer.matchId) {
            killAlpha = layer.matchId === overlayFocus.matchId ? 0.85 : 0.2;
          } else if (!layer.data && focus != null && focus !== k.victim) {
            killAlpha = 0.35;
          }
          ctx.globalAlpha = killAlpha;
          ctx.lineWidth = px(2.25);
          ctx.beginPath();
          ctx.moveTo(p.x - s, p.y - s);
          ctx.lineTo(p.x + s, p.y + s);
          ctx.moveTo(p.x + s, p.y - s);
          ctx.lineTo(p.x - s, p.y + s);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // Players
      data.players.forEach((pl, idx) => {
        if (hidden?.has(pl.steamId)) return;
        const st = playerStateAt(data, round, idx, tick);
        if (!st || !st.alive) return;
        const side = round.sideOf[pl.team];
        const color = SIDE_COLOR[side];
        const p = worldToRadar(map, st.x, st.y, st.z);
        const r = px(6.5 * marker);

        const isFocusedPlayer =
          overlayFocus != null &&
          layer.matchId === overlayFocus.matchId &&
          pl.steamId === overlayFocus.steamId;
        const isFocusedMatch =
          overlayFocus != null && layer.matchId === overlayFocus.matchId;
        const dim =
          overlayFocus != null
            ? !isFocusedMatch
              ? 0.22
              : isFocusedPlayer
                ? 1
                : 0.55
            : !layer.data && focus != null && focus !== idx
              ? 0.35
              : multi
                ? 0.85
                : 1;
        const highlighted = isFocusedPlayer || (!overlayFocus && focus === idx);

        ctx.globalAlpha = dim;

        // view direction
        const rad = (-st.yaw * Math.PI) / 180;
        ctx.fillStyle = color;
        ctx.globalAlpha = dim * 0.35;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, r * (highlighted ? 3.8 : 3.2), rad - 0.32, rad + 0.32);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = dim;

        ctx.beginPath();
        ctx.arc(p.x, p.y, r * (highlighted ? 1.15 : 1), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = px(highlighted ? 2.75 : 1.5);
        ctx.strokeStyle = highlighted ? "#ffffff" : "rgba(0,0,0,0.85)";
        ctx.stroke();

        // HP arc when hurt
        if (st.hp < 100) {
          ctx.strokeStyle = "rgba(0,0,0,0.75)";
          ctx.lineWidth = px(2);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 0.55, -Math.PI / 2 + (Math.PI * 2 * st.hp) / 100, Math.PI * 1.5);
          ctx.stroke();
        }

        if (st.c4) drawC4(ctx, p.x + r * 0.9, p.y + r * 0.9, px(3.5 * marker));

        if (settings.showNames || highlighted) {
          ctx.font = `600 ${px((highlighted ? 11.5 : 10.5) * marker)}px ui-sans-serif, system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          const text = pl.name;
          ctx.lineWidth = px(3);
          ctx.strokeStyle = "rgba(0,0,0,0.9)";
          ctx.strokeText(text, p.x, p.y - r - px(3));
          ctx.fillStyle = highlighted ? "#ffffff" : "#f4f4f5";
          ctx.fillText(text, p.x, p.y - r - px(3));
        }
        ctx.globalAlpha = 1;
      });
    }

    // Drawings
    const visible = strokes.filter((s) => s.round == null || s.round === roundNumber);
    for (const s of draft.current ? [...visible, draft.current] : visible) drawStroke(ctx, s, px);

    ctx.restore();
  });

  // ---------- interactions ----------
  function hitPlayer(
    clientX: number,
    clientY: number,
  ): { idx: number; steamId: string; matchId: string | null } | null {
    const w = toWorld(clientX, clientY);
    const { scale } = transform();
    let bestIdx = -1;
    let bestSteam = "";
    let bestMatch: string | null = null;
    let bestD = Infinity;
    for (const layer of layers) {
      const data = layer.data ?? replay;
      const { round, tick } = layer;
      for (let idx = 0; idx < data.players.length; idx++) {
        const pl = data.players[idx];
        if (hiddenSteamIds?.has(pl.steamId)) continue;
        const st = playerStateAt(data, round, idx, tick);
        if (!st?.alive) continue;
        const p = worldToRadar(map, st.x, st.y, st.z);
        const d = Math.hypot(p.x - w.x, p.y - w.y) * scale;
        if (d < 14 && d < bestD) {
          bestD = d;
          bestIdx = idx;
          bestSteam = pl.steamId;
          bestMatch = layer.matchId ?? null;
        }
      }
      if (!onOverlayFocus && layers.length === 1) break;
    }
    return bestIdx >= 0 ? { idx: bestIdx, steamId: bestSteam, matchId: bestMatch } : null;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "draw") {
      const p = toWorld(e.clientX, e.clientY);
      draft.current = { id: nanoid(8), color: drawColor, width: 3, tool: drawShape, round: roundNumber, points: [p] };
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY, moved: false };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "draw" && draft.current) {
      const p = toWorld(e.clientX, e.clientY);
      if (draft.current.tool === "free") draft.current.points.push(p);
      else draft.current.points = [draft.current.points[0], p];
      forceRender((n) => n + 1);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) onViewChange({ ...view, panX: d.panX + dx, panY: d.panY + dy });
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (tool === "draw" && draft.current) {
      if (draft.current.points.length > 1) onStrokeAdd(draft.current);
      draft.current = null;
      forceRender((n) => n + 1);
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const hit = hitPlayer(e.clientX, e.clientY);
      if (onOverlayFocus) {
        if (hit?.steamId && hit.matchId) {
          const same =
            overlayFocus?.steamId === hit.steamId && overlayFocus?.matchId === hit.matchId;
          onOverlayFocus(same ? null : { steamId: hit.steamId, matchId: hit.matchId });
        } else {
          onOverlayFocus(null);
        }
      } else {
        onFocus(hit && hit.idx === focus ? null : (hit?.idx ?? null));
      }
    }
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const zoom = Math.min(Math.max(view.zoom * Math.exp(-e.deltaY * 0.0015), 0.5), 8);
    const { ox, oy } = transform();
    const k = zoom / view.zoom;
    // keep the point under the cursor fixed
    const nx = mx - (mx - ox) * k;
    const ny = my - (my - oy) * k;
    const fit = Math.min(size.w / worldW, size.h / RADAR_SIZE) * 0.96;
    const baseX = size.w / 2 - (worldW * fit * zoom) / 2;
    const baseY = size.h / 2 - (RADAR_SIZE * fit * zoom) / 2;
    onViewChange({ zoom, panX: nx - baseX, panY: ny - baseY });
  }

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        style={{ cursor: tool === "draw" ? "crosshair" : drag.current?.moved ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={() => tool === "pan" && onViewChange({ zoom: 1, panX: 0, panY: 0 })}
      />
    </div>
  );
}

function drawC4(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = "#dc2626";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = s * 0.25;
  ctx.beginPath();
  ctx.rect(x - s, y - s * 0.7, s * 2, s * 1.4);
  ctx.fill();
  ctx.stroke();
}

function drawStroke(ctx: CanvasRenderingContext2D, s: PaintStroke, px: (n: number) => number) {
  if (s.points.length === 0) return;
  ctx.strokeStyle = s.color;
  ctx.lineWidth = px(s.width);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const a = s.points[0];
  const b = s.points[s.points.length - 1];
  ctx.beginPath();
  if (s.tool === "circle") {
    ctx.arc(a.x, a.y, Math.hypot(b.x - a.x, b.y - a.y), 0, Math.PI * 2);
  } else {
    ctx.moveTo(a.x, a.y);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
  }
  ctx.stroke();
  if (s.tool === "arrow" && s.points.length >= 2) {
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const head = px(12);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }
}
