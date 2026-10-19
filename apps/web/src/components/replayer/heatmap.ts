import {
  RADAR_SIZE,
  hasLowerLevel,
  normalizeMapName,
  worldToRadar,
  type ReplayData,
  type Side,
  type UtilType,
} from "@skybox/shared";
import type { Layer } from "./MapCanvas";

export type HeatmapMode =
  | "off"
  | "positions"
  | "deaths"
  | "plants"
  | "smoke"
  | "flash"
  | "molotov"
  | "he"
  | "util_all"
  | "throws";

export type HeatmapSide = "" | Side;

export type HeatmapConfig = {
  mode: HeatmapMode;
  side: HeatmapSide;
  /** Empty = all players matching side filter */
  steamId: string;
  /** 0.2 – 1 opacity of the overlay */
  intensity: number;
  /** Draw throw→land arcs for util modes */
  showArcs: boolean;
};

export const DEFAULT_HEATMAP: HeatmapConfig = {
  mode: "off",
  side: "",
  steamId: "",
  intensity: 0.75,
  showArcs: true,
};

export const HEATMAP_MODES: { value: HeatmapMode; label: string; group: "base" | "stuff" }[] = [
  { value: "off", label: "Off", group: "base" },
  { value: "positions", label: "Positions", group: "base" },
  { value: "deaths", label: "Morts", group: "base" },
  { value: "plants", label: "Plants", group: "base" },
  { value: "smoke", label: "Smokes", group: "stuff" },
  { value: "flash", label: "Flashs", group: "stuff" },
  { value: "molotov", label: "Molotovs", group: "stuff" },
  { value: "he", label: "HE", group: "stuff" },
  { value: "util_all", label: "Tout util", group: "stuff" },
  { value: "throws", label: "Throws", group: "stuff" },
];

export type HeatmapPlayerOption = {
  steamId: string;
  name: string;
  side: Side;
};

export type UtilArc = {
  type: UtilType;
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  side: Side;
  steamId: string;
};

const CELL = 2;
const SPLAT_R = 7;
const BLUR_PX = 10;

export type HeatmapGrid = {
  width: number;
  height: number;
  data: Float32Array;
  max: number;
  pointCount: number;
};

export function isUtilMode(mode: HeatmapMode) {
  return (
    mode === "smoke" ||
    mode === "flash" ||
    mode === "molotov" ||
    mode === "he" ||
    mode === "util_all" ||
    mode === "throws"
  );
}

function utilTypesForMode(mode: HeatmapMode): UtilType[] | null {
  if (mode === "smoke") return ["smoke"];
  if (mode === "flash") return ["flash"];
  if (mode === "molotov") return ["molotov"];
  if (mode === "he") return ["he"];
  if (mode === "util_all" || mode === "throws") return ["smoke", "flash", "molotov", "he", "decoy"];
  return null;
}

function gridDims(map: string) {
  const lower = hasLowerLevel(normalizeMapName(map));
  return {
    w: Math.ceil((lower ? RADAR_SIZE * 2 : RADAR_SIZE) / CELL),
    h: Math.ceil(RADAR_SIZE / CELL),
  };
}

function splat(grid: Float32Array, w: number, h: number, gx: number, gy: number, weight: number) {
  const r = SPLAT_R;
  const x0 = Math.max(0, Math.floor(gx - r));
  const x1 = Math.min(w - 1, Math.ceil(gx + r));
  const y0 = Math.max(0, Math.floor(gy - r));
  const y1 = Math.min(h - 1, Math.ceil(gy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = (x - gx) * (x - gx) + (y - gy) * (y - gy);
      if (d2 > r2) continue;
      const u = d2 / r2;
      grid[y * w + x] += weight * Math.exp(-3.2 * u);
    }
  }
}

function addPoint(
  grid: Float32Array,
  w: number,
  h: number,
  map: string,
  x: number,
  y: number,
  z: number,
  weight: number,
) {
  const p = worldToRadar(map, x, y, z);
  splat(grid, w, h, p.x / CELL, p.y / CELL, weight);
}

function sideOk(side: Side, filter: HeatmapSide) {
  return !filter || side === filter;
}

function playerOk(
  steamId: string,
  side: Side,
  config: HeatmapConfig,
  hiddenSteamIds?: ReadonlySet<string>,
) {
  if (hiddenSteamIds?.has(steamId)) return false;
  if (config.steamId && steamId !== config.steamId) return false;
  if (!sideOk(side, config.side)) return false;
  return true;
}

export function collectHeatmapPlayers(layers: Layer[]): HeatmapPlayerOption[] {
  const map = new Map<string, HeatmapPlayerOption>();
  for (const layer of layers) {
    const replay = layer.data;
    if (!replay) continue;
    for (const pl of replay.players) {
      const side = layer.round.sideOf[pl.team];
      if (!map.has(pl.steamId)) {
        map.set(pl.steamId, { steamId: pl.steamId, name: pl.name || pl.steamId, side });
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

function forEachUtilPath(
  layers: Layer[],
  config: HeatmapConfig,
  hiddenSteamIds: ReadonlySet<string> | undefined,
  types: UtilType[],
  fn: (args: {
    type: UtilType;
    side: Side;
    steamId: string;
    x0: number;
    y0: number;
    z0: number;
    x1: number;
    y1: number;
    z1: number;
  }) => void,
) {
  const typeSet = new Set(types);
  for (const layer of layers) {
    const replay = layer.data;
    if (!replay) continue;
    const round = layer.round;
    for (const g of round.paths) {
      if (!typeSet.has(g.type) || g.xs.length < 2) continue;
      if (g.thrower == null) continue;
      const pl = replay.players[g.thrower];
      if (!pl) continue;
      const side = round.sideOf[pl.team];
      if (!playerOk(pl.steamId, side, config, hiddenSteamIds)) continue;
      const last = g.xs.length - 1;
      fn({
        type: g.type,
        side,
        steamId: pl.steamId,
        x0: g.xs[0],
        y0: g.ys[0],
        z0: 0,
        x1: g.xs[last],
        y1: g.ys[last],
        z1: 0,
      });
    }
  }
}

/** Throw→land arcs for util pattern modes. */
export function buildUtilArcs(
  layers: Layer[],
  config: HeatmapConfig,
  hiddenSteamIds?: ReadonlySet<string>,
): UtilArc[] {
  if (!isUtilMode(config.mode) || !config.showArcs || config.mode === "throws") return [];
  const types = utilTypesForMode(config.mode);
  if (!types) return [];
  const arcs: UtilArc[] = [];
  forEachUtilPath(layers, config, hiddenSteamIds, types, (a) => {
    arcs.push({
      type: a.type,
      x0: a.x0,
      y0: a.y0,
      z0: a.z0,
      x1: a.x1,
      y1: a.y1,
      z1: a.z1,
      side: a.side,
      steamId: a.steamId,
    });
  });
  // Cap for perf when overlaying many demos
  if (arcs.length > 400) {
    const step = Math.ceil(arcs.length / 400);
    return arcs.filter((_, i) => i % step === 0);
  }
  return arcs;
}

export function buildHeatmap(
  mapName: string,
  layers: Layer[],
  config: HeatmapConfig,
  hiddenSteamIds?: ReadonlySet<string>,
): HeatmapGrid | null {
  if (config.mode === "off" || !layers.length) return null;

  const map = normalizeMapName(mapName);
  const { w, h } = gridDims(map);
  const data = new Float32Array(w * h);
  let points = 0;

  const utilTypes = utilTypesForMode(config.mode);
  if (utilTypes) {
    forEachUtilPath(layers, config, hiddenSteamIds, utilTypes, (a) => {
      if (config.mode === "throws") {
        addPoint(data, w, h, map, a.x0, a.y0, a.z0, 2.2);
      } else {
        // Landing / detonation pattern
        addPoint(data, w, h, map, a.x1, a.y1, a.z1, 2.2);
      }
      points++;
    });
    // Fallback: util events without path (detonation only) — skip throws mode
    if (config.mode !== "throws") {
      const typeSet = new Set(utilTypes);
      for (const layer of layers) {
        const replay = layer.data;
        if (!replay) continue;
        const round = layer.round;
        for (const u of round.util) {
          if (!typeSet.has(u.type)) continue;
          if (u.thrower == null) continue;
          const pl = replay.players[u.thrower];
          if (!pl) continue;
          if (!playerOk(pl.steamId, round.sideOf[pl.team], config, hiddenSteamIds)) continue;
          // Prefer paths; only add util if no nearby path end already counted heavily — always add light weight
          addPoint(data, w, h, map, u.x, u.y, u.z, 1.2);
          points++;
        }
      }
    }
  } else {
    for (const layer of layers) {
      const replay = layer.data;
      if (!replay) continue;
      const round = layer.round;

      if (config.mode === "plants") {
        const b = round.bomb;
        if (b.plantTick == null || b.plantX == null || b.plantY == null) continue;
        if (config.side && config.side !== "T") continue;
        if (config.steamId) {
          if (b.planter == null) continue;
          const planter = replay.players[b.planter];
          if (!planter || planter.steamId !== config.steamId) continue;
        }
        addPoint(data, w, h, map, b.plantX, b.plantY, 0, 3);
        points++;
        continue;
      }

      if (config.mode === "deaths") {
        for (const k of round.kills) {
          const victim = replay.players[k.victim];
          if (!victim) continue;
          if (!playerOk(victim.steamId, round.sideOf[victim.team], config, hiddenSteamIds)) continue;
          addPoint(data, w, h, map, k.victimX, k.victimY, k.victimZ, 2.5);
          points++;
        }
        continue;
      }

      // positions
      const stride = Math.max(1, Math.round(replay.tickRate / 6 / Math.max(1, replay.sampleStep)));
      for (let idx = 0; idx < replay.players.length; idx++) {
        const pl = replay.players[idx];
        if (!playerOk(pl.steamId, round.sideOf[pl.team], config, hiddenSteamIds)) continue;
        const tr = round.tracks[idx];
        if (!tr?.hp.length) continue;
        for (let s = 0; s < round.samples; s += stride) {
          if (tr.hp[s] <= 0) continue;
          const tick = round.sampleStart + s * replay.sampleStep;
          if (tick < round.freezeEndTick) continue;
          addPoint(data, w, h, map, tr.x[s], tr.y[s], tr.z[s], 1);
          points++;
        }
      }
    }
  }

  let max = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
  return { width: w, height: h, data, max, pointCount: points };
}

function heatColor(t: number): [number, number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  let r: number, g: number, b: number;
  if (x < 0.25) {
    const u = x / 0.25;
    r = 20 + 20 * u;
    g = 40 + 110 * u;
    b = 90 + 150 * u;
  } else if (x < 0.5) {
    const u = (x - 0.25) / 0.25;
    r = 40 + 30 * u;
    g = 150 + 90 * u;
    b = 240 - 100 * u;
  } else if (x < 0.75) {
    const u = (x - 0.5) / 0.25;
    r = 70 + 170 * u;
    g = 240 - 40 * u;
    b = 140 - 120 * u;
  } else {
    const u = (x - 0.75) / 0.25;
    r = 240 + 15 * u;
    g = 200 - 170 * u;
    b = 20;
  }
  const a = Math.min(255, Math.floor(30 + 225 * Math.pow(x, 0.7)));
  return [r, g, b, a];
}

export function renderHeatmapImage(grid: HeatmapGrid, intensity: number): HTMLCanvasElement {
  const outW = grid.width * CELL;
  const outH = grid.height * CELL;
  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  if (!ctx || grid.max <= 0) return out;

  const tiny = document.createElement("canvas");
  tiny.width = grid.width;
  tiny.height = grid.height;
  const tctx = tiny.getContext("2d")!;
  const img = tctx.createImageData(grid.width, grid.height);
  const inv = 1 / grid.max;
  const boost = Math.min(1.35, Math.max(0.45, intensity));

  for (let i = 0; i < grid.data.length; i++) {
    const v = grid.data[i];
    if (v <= 0) continue;
    const t = Math.min(1, Math.pow(v * inv, 0.6) * boost);
    if (t < 0.03) continue;
    const [r, g, b, a] = heatColor(t);
    const o = i * 4;
    img.data[o] = r;
    img.data[o + 1] = g;
    img.data[o + 2] = b;
    img.data[o + 3] = Math.floor(a * intensity);
  }
  tctx.putImageData(img, 0, 0);

  const mid = document.createElement("canvas");
  mid.width = outW;
  mid.height = outH;
  const mctx = mid.getContext("2d")!;
  mctx.imageSmoothingEnabled = true;
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(tiny, 0, 0, outW, outH);

  ctx.clearRect(0, 0, outW, outH);
  ctx.filter = `blur(${BLUR_PX}px)`;
  ctx.drawImage(mid, 0, 0);
  ctx.filter = "none";
  return out;
}
