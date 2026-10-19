import { mapSlug } from "@/lib/shareCode";
import { filterActive, type RoundFilter } from "./model";

export type ShareTarget = {
  shareCode: string;
  mapName?: string | null;
};

export function buildRoundShareParams(opts: { filter?: RoundFilter }): URLSearchParams {
  const params = new URLSearchParams();
  if (opts.filter && filterActive(opts.filter)) {
    if (opts.filter.team) params.set("team", opts.filter.team);
    if (opts.filter.side) params.set("side", opts.filter.side);
    if (opts.filter.buy) params.set("buy", opts.filter.buy);
    if (opts.filter.oppBuy) params.set("oppBuy", opts.filter.oppBuy);
  }
  return params;
}

function formatSeconds(t: number): string {
  const rounded = Math.round(t * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Path only: /r/{code}/mirage/r12/8s */
export function buildRoundSharePath(
  target: ShareTarget,
  opts: { round: number; t?: number },
): string {
  const map = mapSlug(target.mapName);
  let path = `/r/${target.shareCode}/${map}/r${opts.round}`;
  if (opts.t != null && Number.isFinite(opts.t) && opts.t > 0.05) {
    path += `/${formatSeconds(opts.t)}s`;
  }
  return path;
}

/** Absolute shareable URL for Discord / teammates. */
export function buildRoundShareUrl(
  target: ShareTarget,
  opts: {
    round: number;
    t?: number;
    filter?: RoundFilter;
    origin?: string;
  },
): string {
  const path = buildRoundSharePath(target, opts);
  const params = buildRoundShareParams({ filter: opts.filter });
  const qs = params.toString();
  const full = qs ? `${path}?${qs}` : path;
  const origin =
    opts.origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return origin ? `${origin.replace(/\/$/, "")}${full}` : full;
}

/** Sync address bar to the pretty share path without remounting. */
export function replaceRoundQuery(
  target: ShareTarget,
  opts: { round: number; t?: number; filter?: RoundFilter },
) {
  if (typeof window === "undefined") return;
  const path = buildRoundSharePath(target, opts);
  const params = buildRoundShareParams({ filter: opts.filter });
  const qs = params.toString();
  const next = qs ? `${path}?${qs}` : path;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next !== current) {
    window.history.replaceState(window.history.state, "", next);
  }
}

/** Parse /r/{code}/[[...slug]] → round + seconds */
export function parseShareSlug(slug: string[] | undefined): {
  round: number | null;
  seconds: number | null;
} {
  let round: number | null = null;
  let seconds: number | null = null;
  for (const part of slug ?? []) {
    const time = /^(\d+(?:\.\d+)?)s$/i.exec(part);
    if (time) {
      const n = Number(time[1]);
      if (Number.isFinite(n) && n >= 0) seconds = n;
      continue;
    }
    const r = /^r?(\d+)$/i.exec(part);
    if (r) {
      const n = Number(r[1]);
      if (Number.isFinite(n) && n > 0) round = n;
    }
  }
  return { round, seconds };
}
