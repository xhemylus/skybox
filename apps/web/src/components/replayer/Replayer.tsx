"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isMapSupported,
  type BuyType,
  type PaintStroke,
  type ReplayData,
  type Side,
  type TeamKey,
} from "@skybox/shared";
import { HeatmapControls } from "./HeatmapControls";
import { KillFeed } from "./KillFeed";
import {
  MapCanvas,
  type DrawShape,
  type Layer,
  type OverlayFocus,
  type Tool,
  type View,
} from "./MapCanvas";
import { MapScoutPanel, type ScoutRoundDto } from "./MapScoutPanel";
import {
  DEFAULT_HEATMAP,
  buildHeatmap,
  buildUtilArcs,
  collectHeatmapPlayers,
  renderHeatmapImage,
  type HeatmapConfig,
} from "./heatmap";
import {
  DEFAULT_SETTINGS,
  EMPTY_FILTER,
  ROUND_TIME_S,
  SIDE_COLOR,
  SPEEDS,
  filterActive,
  formatClock,
  roundMatches,
  type RoundFilter,
  type Settings,
} from "./model";
import { CopyRoundLink } from "./CopyRoundLink";
import { OverlayRoster, type OverlayPlayer } from "./OverlayRoster";
import { RoundNotePanel } from "./RoundNotePanel";
import { RoundStrip } from "./RoundStrip";
import { replaceRoundQuery } from "./shareUrl";
import { TeamPanel } from "./TeamPanel";
import { Timeline } from "./Timeline";
import { Toolbar } from "./Toolbar";
import { UnsupportedMap } from "./UnsupportedMap";

const SEEK_SECONDS = 5;
const MULTI_LEAD_SECONDS = 5;

export type RoundNoteMap = Record<
  number,
  { body: string; authorName?: string | null; updatedAt?: string }
>;

function parseInitialFilter(init?: {
  team?: TeamKey | null;
  side?: Side | null;
  buy?: BuyType | null;
  oppBuy?: BuyType | null;
}): RoundFilter {
  return {
    ...EMPTY_FILTER,
    team: init?.team === "B" ? "B" : "A",
    side: init?.side === "CT" || init?.side === "T" ? init.side : "",
    buy: init?.buy && ["pistol", "eco", "force", "full"].includes(init.buy) ? init.buy : "",
    oppBuy:
      init?.oppBuy && ["pistol", "eco", "force", "full"].includes(init.oppBuy) ? init.oppBuy : "",
  };
}

async function fetchReplay(id: string): Promise<ReplayData> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(`/api/matches/${id}/replay`, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) throw new Error(data.error ?? "Replay pas encore prêt — réessaie dans un instant.");
      if (res.status === 404) throw new Error(data.error ?? "Match introuvable.");
      throw new Error(data.error ?? `Impossible de charger le replay (HTTP ${res.status})`);
    }
    const data = (await res.json()) as ReplayData;
    if (!data?.rounds?.length || !data?.players?.length) {
      throw new Error("Replay corrompu ou vide. Relance l'analyse depuis le dashboard.");
    }
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Chargement trop long (timeout). Vérifie ta connexion ou réessaie.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function Replayer({
  matchId,
  shareCode,
  mapName,
  mapLabel,
  initialStrokes,
  initialRoundNotes = {},
  teamAName,
  teamBName,
  initialRound,
  initialSeconds,
  initialFilter,
}: {
  matchId: string;
  /** Short code for readable /r/{code}/… links */
  shareCode: string;
  mapName?: string | null;
  mapLabel: string;
  initialStrokes: PaintStroke[];
  initialRoundNotes?: RoundNoteMap;
  teamAName?: string | null;
  teamBName?: string | null;
  /** 1-based round number from query (?round=) */
  initialRound?: number | null;
  /** Seconds after freeze end from query (?t=) */
  initialSeconds?: number | null;
  initialFilter?: {
    team?: TeamKey | null;
    side?: Side | null;
    buy?: BuyType | null;
    oppBuy?: BuyType | null;
  };
}) {
  const shareTarget = useMemo(() => ({ shareCode, mapName }), [shareCode, mapName]);
  const [replay, setReplay] = useState<ReplayData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [roundIdx, setRoundIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const [multi, setMulti] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [relTick, setRelTick] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const [tool, setTool] = useState<Tool>("pan");
  const [drawColor, setDrawColor] = useState("#c9b896");
  const [drawShape, setDrawShape] = useState<DrawShape>("free");
  const [strokes, setStrokes] = useState<PaintStroke[]>(initialStrokes);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [roundNotes, setRoundNotes] = useState<RoundNoteMap>(initialRoundNotes);
  const [noteSaveState, setNoteSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const noteDraftRef = useRef<Record<number, string>>({});

  const [view, setView] = useState<View>({ zoom: 1, panX: 0, panY: 0 });
  const [focus, setFocus] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [filter, setFilter] = useState<RoundFilter>(() => parseInitialFilter(initialFilter));
  const initialHadFilter = filterActive(parseInitialFilter(initialFilter));
  /** Coach tools (scout / multi / patterns) — off by default for simple review. */
  const [coachTools, setCoachTools] = useState(initialHadFilter);
  const [scoutOpen, setScoutOpen] = useState(initialHadFilter);

  // Cross-match scout overlay
  const [scoutOverlay, setScoutOverlay] = useState(false);
  const [scoutRounds, setScoutRounds] = useState<ScoutRoundDto[]>([]);
  const [enabledMatches, setEnabledMatches] = useState<Set<string>>(() => new Set());
  const [extraReplays, setExtraReplays] = useState<Record<string, ReplayData>>({});
  const [overlayLoading, setOverlayLoading] = useState(false);
  /** Seconds relative to freeze end (cross-match sync, tick-rate safe). */
  const [relSeconds, setRelSeconds] = useState(0);
  /** Steam IDs hidden on the overlay radar. */
  const [hiddenPlayers, setHiddenPlayers] = useState<Set<string>>(() => new Set());
  /** Radar click highlight (player + match). */
  const [overlayFocus, setOverlayFocus] = useState<OverlayFocus | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapConfig>(DEFAULT_HEATMAP);

  const replayCache = useRef<Map<string, ReplayData>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setReplay(null);
    fetchReplay(matchId)
      .then((data) => {
        if (cancelled) return;
        const teams = data.teams.map((t) => {
          if (t.key === "A" && teamAName) return { ...t, name: teamAName };
          if (t.key === "B" && teamBName) return { ...t, name: teamBName };
          return t;
        }) as ReplayData["teams"];
        const patched = { ...data, teams };
        setReplay(patched);
        replayCache.current.set(matchId, patched);
        let idx = 0;
        if (initialRound != null && initialRound > 0) {
          const found = data.rounds.findIndex((r) => r.number === initialRound);
          if (found >= 0) idx = found;
        }
        setRoundIdx(idx);
        const start = data.rounds[idx];
        const freeze = start?.freezeEndTick ?? start?.startTick ?? 0;
        let nextTick = freeze;
        if (initialSeconds != null && initialSeconds > 0 && start) {
          nextTick = Math.min(
            Math.max(freeze + initialSeconds * data.tickRate, start.startTick),
            start.nextStartTick - 1,
          );
        }
        setTick(nextTick);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Erreur de chargement"));
    return () => {
      cancelled = true;
    };
  }, [matchId, teamAName, teamBName, initialRound, initialSeconds, loadAttempt]);

  useEffect(() => {
    const saved = localStorage.getItem("replayer-settings");
    if (saved) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
  }, []);

  function updateSettings(s: Settings) {
    setSettings(s);
    localStorage.setItem("replayer-settings", JSON.stringify(s));
  }

  // Autosave drawings
  const firstSave = useRef(true);
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(async () => {
      const res = await fetch(`/api/matches/${matchId}/annotations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strokes }),
      }).catch(() => null);
      setSaveState(res?.ok ? "saved" : "error");
      if (res?.ok) setTimeout(() => setSaveState("idle"), 1500);
    }, 700);
    return () => clearTimeout(t);
  }, [strokes, matchId]);

  const noteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function updateRoundNote(roundNumber: number, body: string) {
    noteDraftRef.current[roundNumber] = body;
    setRoundNotes((prev) => {
      const next = { ...prev };
      if (body.trim()) {
        next[roundNumber] = {
          body,
          authorName: prev[roundNumber]?.authorName,
          updatedAt: prev[roundNumber]?.updatedAt,
        };
      } else {
        delete next[roundNumber];
      }
      return next;
    });
    setNoteSaveState("saving");
    const existing = noteTimers.current.get(roundNumber);
    if (existing) clearTimeout(existing);
    const t = setTimeout(async () => {
      noteTimers.current.delete(roundNumber);
      const payload = noteDraftRef.current[roundNumber] ?? body;
      const res = await fetch(`/api/matches/${matchId}/round-notes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundNumber, body: payload }),
      }).catch(() => null);
      if (!res?.ok) {
        setNoteSaveState("error");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        note?: { body: string; authorName?: string | null; updatedAt?: string } | null;
      };
      setRoundNotes((prev) => {
        const next = { ...prev };
        if (data.note) next[roundNumber] = data.note;
        else delete next[roundNumber];
        return next;
      });
      setNoteSaveState("saved");
      setTimeout(() => setNoteSaveState("idle"), 1500);
    }, 600);
    noteTimers.current.set(roundNumber, t);
  }

  const round = replay?.rounds[roundIdx] ?? null;
  const notedRounds = useMemo(
    () => new Set(Object.keys(roundNotes).map(Number).filter((n) => roundNotes[n]?.body?.trim())),
    [roundNotes],
  );

  const active = filterActive(filter);
  const stacked = multi || scoutOverlay;

  // Keep address bar shareable (round + time) without remounting the page
  useEffect(() => {
    if (!replay || !round || stacked) return;
    const t = (tick - round.freezeEndTick) / replay.tickRate;
    if (playing) {
      replaceRoundQuery(shareTarget, { round: round.number, filter });
      return;
    }
    const timer = setTimeout(() => {
      replaceRoundQuery(shareTarget, { round: round.number, t, filter });
    }, 400);
    return () => clearTimeout(timer);
  }, [replay, round, tick, playing, filter, stacked, shareTarget]);

  const multiRange = useMemo(() => {
    if (!replay || !selected.length) return { from: 0, to: 1 };
    const lead = MULTI_LEAD_SECONDS * replay.tickRate;
    return {
      from: -lead,
      to: Math.max(...selected.map((i) => replay.rounds[i].nextStartTick - replay.rounds[i].freezeEndTick)),
    };
  }, [replay, selected]);

  const scoutRange = useMemo(() => {
    const from = -MULTI_LEAD_SECONDS;
    if (!scoutOverlay || !scoutRounds.length) return { from, to: ROUND_TIME_S };
    let maxDur = 0;
    for (const sr of scoutRounds) {
      if (!enabledMatches.has(sr.matchId)) continue;
      const data =
        sr.matchId === matchId ? replay : extraReplays[sr.matchId] ?? replayCache.current.get(sr.matchId);
      if (!data) continue;
      const r = data.rounds.find((x) => x.number === sr.roundNumber);
      if (!r) continue;
      maxDur = Math.max(maxDur, (r.nextStartTick - r.freezeEndTick) / data.tickRate);
    }
    return { from, to: Math.max(maxDur, 1) };
  }, [scoutOverlay, scoutRounds, enabledMatches, extraReplays, matchId, replay]);

  const nextRoundIdx = useCallback(
    (from: number, dir: 1 | -1) => {
      if (!replay) return null;
      for (let i = from + dir; i >= 0 && i < replay.rounds.length; i += dir) {
        if (!active || roundMatches(replay.rounds[i], filter)) return i;
      }
      return null;
    },
    [replay, filter, active],
  );

  // ---------- playback loop ----------
  const state = useRef({
    tick,
    relTick,
    relSeconds,
    roundIdx,
    speed,
    settings,
    multiRange,
    scoutRange,
    nextRoundIdx,
    multi,
    scoutOverlay,
  });
  state.current = {
    tick,
    relTick,
    relSeconds,
    roundIdx,
    speed,
    settings,
    multiRange,
    scoutRange,
    nextRoundIdx,
    multi,
    scoutOverlay,
  };

  useEffect(() => {
    if (!playing || !replay) return;
    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const s = state.current;
      const dt = (now - last) / 1000;
      last = now;
      if (s.scoutOverlay) {
        const next = s.relSeconds + dt * s.speed;
        if (next >= s.scoutRange.to) {
          setRelSeconds(s.scoutRange.to);
          setPlaying(false);
          return;
        }
        state.current.relSeconds = next;
        setRelSeconds(next);
      } else if (s.multi) {
        const advance = dt * replay.tickRate * s.speed;
        const next = s.relTick + advance;
        if (next >= s.multiRange.to) {
          setRelTick(s.multiRange.to);
          setPlaying(false);
          return;
        }
        state.current.relTick = next;
        setRelTick(next);
      } else {
        const advance = dt * replay.tickRate * s.speed;
        const r = replay.rounds[s.roundIdx];
        let next = s.tick + advance;
        if (next >= r.nextStartTick) {
          const n = s.settings.autoNext ? s.nextRoundIdx(s.roundIdx, 1) : null;
          if (n == null) {
            setTick(r.nextStartTick - 1);
            setPlaying(false);
            return;
          }
          next = replay.rounds[n].startTick;
          state.current.roundIdx = n;
          setRoundIdx(n);
        }
        state.current.tick = next;
        setTick(next);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, replay, multi, scoutOverlay]);

  const goToRound = useCallback(
    (i: number) => {
      if (!replay) return;
      setRoundIdx(i);
      setTick(replay.rounds[i].freezeEndTick);
      setFocus(null);
    },
    [replay],
  );

  const stepFiltered = useCallback(
    (dir: -1 | 1) => {
      if (scoutOverlay) return;
      const n = nextRoundIdx(roundIdx, dir);
      if (n != null) goToRound(n);
      else if (replay) {
        const fallback = Math.min(Math.max(roundIdx + dir, 0), replay.rounds.length - 1);
        if (fallback !== roundIdx) goToRound(fallback);
      }
    },
    [nextRoundIdx, roundIdx, goToRound, replay, scoutOverlay],
  );

  // When filters change, jump to a matching round if current doesn't match
  useEffect(() => {
    if (!replay || !filterActive(filter) || scoutOverlay) return;
    if (roundMatches(replay.rounds[roundIdx], filter)) return;
    const first = replay.rounds.findIndex((r) => roundMatches(r, filter));
    if (first >= 0) goToRound(first);
  }, [filter, replay]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSelectRound(i: number) {
    if (scoutOverlay) return;
    if (!multi) return goToRound(i);
    setSelected((sel) => (sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].sort((a, b) => a - b)));
  }

  const stopOverlay = useCallback(() => {
    setScoutOverlay(false);
    setScoutRounds([]);
    setEnabledMatches(new Set());
    setRelSeconds(0);
    setHiddenPlayers(new Set());
    setOverlayFocus(null);
    setPlaying(false);
  }, []);

  function onFilterChange(f: RoundFilter) {
    setFilter(f);
    if (filterActive(f)) {
      setCoachTools(true);
      setScoutOpen(true);
    }
    if (scoutOverlay) stopOverlay();
  }

  function toggleCoachTools() {
    setCoachTools((open) => {
      if (open) {
        setScoutOpen(false);
        if (scoutOverlay) stopOverlay();
        if (multi) setMulti(false);
        if (heatmap.mode !== "off") setHeatmap(DEFAULT_HEATMAP);
      }
      return !open;
    });
  }

  const startOverlay = useCallback(
    async (rounds: ScoutRoundDto[]) => {
      if (!rounds.length) return;
      setOverlayLoading(true);
      setPlaying(false);
      setMulti(false);
      setFocus(null);
      try {
        const ids = [...new Set(rounds.map((r) => r.matchId))];
        const next: Record<string, ReplayData> = { ...extraReplays };
        if (replay) {
          next[matchId] = replay;
          replayCache.current.set(matchId, replay);
        }
        await Promise.all(
          ids.map(async (id) => {
            if (next[id] || replayCache.current.has(id)) {
              if (!next[id]) next[id] = replayCache.current.get(id)!;
              return;
            }
            const data = await fetchReplay(id);
            replayCache.current.set(id, data);
            next[id] = data;
          }),
        );
        setExtraReplays(next);
        setScoutRounds(rounds);
        setEnabledMatches(new Set(ids));
        setRelSeconds(0);
        setHiddenPlayers(new Set());
        setOverlayFocus(null);
        setCoachTools(true);
        setScoutOverlay(true);
        setScoutOpen(true);
      } catch (err) {
        console.error(err);
      } finally {
        setOverlayLoading(false);
      }
    },
    [extraReplays, matchId, replay],
  );

  const toggleMatch = useCallback((id: string) => {
    setEnabledMatches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev; // keep at least one
        next.delete(id);
      } else next.add(id);
      return next;
    });
  }, []);

  const soloMatch = useCallback((id: string) => {
    setEnabledMatches(new Set([id]));
  }, []);

  const togglePlayer = useCallback((steamId: string) => {
    setHiddenPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(steamId)) next.delete(steamId);
      else next.add(steamId);
      return next;
    });
  }, []);

  const toggleMulti = useCallback(() => {
    if (!replay || scoutOverlay) return;
    setPlaying(false);
    setMulti((m) => {
      if (!m) {
        const filtered = replay.rounds.map((_, i) => i).filter((i) => roundMatches(replay.rounds[i], filter));
        setSelected(active && filtered.length ? filtered : [roundIdx]);
        setRelTick(0);
        setFocus(null);
      }
      return !m;
    });
  }, [replay, filter, active, roundIdx, scoutOverlay]);

  // ---------- keyboard ----------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!replay || (e.target as HTMLElement).closest("input, textarea, select")) return;
      const s = state.current;
      const seek = SEEK_SECONDS * replay.tickRate;
      const r = replay.rounds[s.roundIdx];
      switch (e.key) {
        case " ":
          e.preventDefault();
          setPlaying((p) => !p);
          break;
        case "ArrowLeft":
        case "ArrowRight": {
          e.preventDefault();
          const dir = e.key === "ArrowLeft" ? -1 : 1;
          if (e.shiftKey && !stacked) {
            const n = s.nextRoundIdx(s.roundIdx, dir);
            if (n != null) goToRound(n);
          } else if (s.scoutOverlay) {
            setRelSeconds(
              Math.min(Math.max(s.relSeconds + dir * SEEK_SECONDS, s.scoutRange.from), s.scoutRange.to),
            );
          } else if (s.multi) {
            setRelTick(Math.min(Math.max(s.relTick + dir * seek, s.multiRange.from), s.multiRange.to));
          } else {
            setTick(Math.min(Math.max(s.tick + dir * seek, r.startTick), r.nextStartTick - 1));
          }
          break;
        }
        case "ArrowUp":
        case "ArrowDown": {
          if (stacked) break;
          e.preventDefault();
          const n = s.nextRoundIdx(s.roundIdx, e.key === "ArrowUp" ? -1 : 1);
          if (n != null) goToRound(n);
          break;
        }
        case "+":
        case "=":
          setSpeed((v) => SPEEDS[Math.min(SPEEDS.indexOf(v) + 1, SPEEDS.length - 1)]);
          break;
        case "-":
          setSpeed((v) => SPEEDS[Math.max(SPEEDS.indexOf(v) - 1, 0)]);
          break;
        case "h":
        case "H":
          setTool("pan");
          break;
        case "d":
        case "D":
          setTool("draw");
          break;
        case "m":
        case "M":
          if (!scoutOverlay && coachTools) toggleMulti();
          break;
        case "n":
        case "N":
          updateSettings({ ...s.settings, showNames: !s.settings.showNames });
          break;
        case "0":
          setView({ zoom: 1, panX: 0, panY: 0 });
          break;
        case "Delete":
        case "Backspace":
          if (!scoutOverlay) {
            setStrokes((list) => list.filter((st) => st.round !== replay.rounds[s.roundIdx].number));
          }
          break;
        case "Escape":
          if (scoutOverlay) {
            if (overlayFocus) setOverlayFocus(null);
            else stopOverlay();
          } else {
            setFocus(null);
            setTool("pan");
          }
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay, multi, scoutOverlay, stacked, goToRound, toggleMulti, stopOverlay, overlayFocus, coachTools]);

  /** Rounds feeding the heatmap: scout overlay layers, else all (filtered) match rounds. */
  const heatSourceLayers = useMemo((): Layer[] => {
    if (!replay) return [];
    if (scoutOverlay) {
      return scoutRounds.flatMap((sr) => {
        if (!enabledMatches.has(sr.matchId)) return [];
        const data =
          sr.matchId === matchId
            ? replay
            : extraReplays[sr.matchId] ?? replayCache.current.get(sr.matchId);
        if (!data) return [];
        const r = data.rounds.find((x) => x.number === sr.roundNumber);
        if (!r) return [];
        return [{ data, matchId: sr.matchId, round: r, tick: r.freezeEndTick }];
      });
    }
    const idxs = active
      ? replay.rounds.map((_, i) => i).filter((i) => roundMatches(replay.rounds[i], filter))
      : replay.rounds.map((_, i) => i);
    return idxs.map((i) => ({
      data: replay,
      matchId,
      round: replay.rounds[i],
      tick: replay.rounds[i].freezeEndTick,
    }));
  }, [
    replay,
    scoutOverlay,
    scoutRounds,
    enabledMatches,
    extraReplays,
    matchId,
    active,
    filter,
  ]);

  const heatmapPlayers = useMemo(
    () => collectHeatmapPlayers(heatSourceLayers),
    [heatSourceLayers],
  );

  const heatmapBuilt = useMemo(() => {
    if (!replay || heatmap.mode === "off") {
      return { image: null as HTMLCanvasElement | null, grid: null, arcs: [] as ReturnType<typeof buildUtilArcs> };
    }
    const hidden = scoutOverlay ? hiddenPlayers : undefined;
    const grid = buildHeatmap(replay.map, heatSourceLayers, heatmap, hidden);
    const arcs = buildUtilArcs(heatSourceLayers, heatmap, hidden);
    if (!grid?.pointCount && !arcs.length) return { image: null, grid, arcs };
    return {
      image: grid?.pointCount ? renderHeatmapImage(grid, heatmap.intensity) : null,
      grid,
      arcs,
    };
  }, [replay, heatSourceLayers, heatmap, scoutOverlay, hiddenPlayers]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="panel max-w-md p-6 text-center">
          <p className="font-semibold">Impossible de charger le replay</p>
          <p className="muted mt-2 text-sm leading-relaxed">{loadError}</p>
          <div className="mt-6 flex justify-center gap-2">
            <button type="button" className="btn btn-primary" onClick={() => setLoadAttempt((n) => n + 1)}>
              Réessayer
            </button>
            <Link href="/dashboard" className="btn btn-ghost">
              Retour
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!replay || !round) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[var(--muted)]">
        <div className="h-5 w-5 animate-spin rounded-full border border-[var(--border)] border-t-[var(--accent)]" />
        <p className="tracking-wide">Chargement du replay…</p>
        <p className="text-xs text-[var(--muted)]">Les gros matchs peuvent prendre quelques secondes.</p>
      </div>
    );
  }

  if (!isMapSupported(replay.map)) {
    return <UnsupportedMap map={replay.map} />;
  }

  const layers: Layer[] = scoutOverlay
    ? scoutRounds.flatMap((sr) => {
        if (!enabledMatches.has(sr.matchId)) return [];
        const data =
          sr.matchId === matchId
            ? replay
            : extraReplays[sr.matchId] ?? replayCache.current.get(sr.matchId);
        if (!data) return [];
        const r = data.rounds.find((x) => x.number === sr.roundNumber);
        if (!r) return [];
        const shortOpp = sr.opponent.length > 10 ? `${sr.opponent.slice(0, 9)}…` : sr.opponent;
        return [
          {
            data,
            matchId: sr.matchId,
            round: r,
            tick: r.freezeEndTick + relSeconds * data.tickRate,
            label: `${shortOpp} R${sr.roundNumber}`,
          },
        ];
      })
    : multi
      ? selected.map((i) => ({
          matchId,
          round: replay.rounds[i],
          tick: replay.rounds[i].freezeEndTick + relTick,
          label: `R${replay.rounds[i].number}`,
        }))
      : [{ matchId, round, tick }];

  const overlayPlayers: OverlayPlayer[] = (() => {
    if (!scoutOverlay) return [];
    const map = new Map<string, OverlayPlayer>();
    for (const layer of layers) {
      const data = layer.data ?? replay;
      for (const pl of data.players) {
        const side = layer.round.sideOf[pl.team];
        const existing = map.get(pl.steamId);
        if (existing) {
          existing.appearances += 1;
          if (!existing.name && pl.name) existing.name = pl.name;
        } else {
          map.set(pl.steamId, {
            steamId: pl.steamId,
            name: pl.name || pl.steamId,
            side,
            appearances: 1,
          });
        }
      }
    }
    return [...map.values()];
  })();

  function soloPlayer(steamId: string) {
    const hide = new Set<string>();
    for (const p of overlayPlayers) {
      if (p.steamId !== steamId) hide.add(p.steamId);
    }
    setHiddenPlayers(hide);
  }

  function toggleSide(side: Side) {
    const sideIds = overlayPlayers.filter((p) => p.side === side).map((p) => p.steamId);
    if (!sideIds.length) return;
    const allHidden = sideIds.every((id) => hiddenPlayers.has(id));
    setHiddenPlayers((prev) => {
      const next = new Set(prev);
      for (const id of sideIds) {
        if (allHidden) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  const teamsBySide = (["A", "B"] as const).slice().sort((a) => (round.sideOf[a] === "CT" ? -1 : 1));
  const focusTeam = replay.teams.find((t) => t.key === filter.team);
  const focusSide = round.sideOf[filter.team];
  const enabledLayerCount = layers.length;

  return (
    <div className="grid h-full grid-rows-[1fr_auto] bg-[var(--bg)]">
      <div className="grid min-h-0 grid-cols-[1fr_280px]">
        <div className="relative min-h-0 overflow-hidden bg-[var(--bg)]">
          <MapCanvas
            replay={replay}
            layers={layers}
            view={view}
            onViewChange={setView}
            tool={tool}
            drawColor={drawColor}
            drawShape={drawShape}
            strokes={strokes}
            roundNumber={stacked ? null : round.number}
            onStrokeAdd={(s) => setStrokes((list) => [...list, s])}
            focus={scoutOverlay ? null : focus}
            onFocus={setFocus}
            settings={settings}
            hiddenSteamIds={scoutOverlay ? hiddenPlayers : undefined}
            overlayFocus={scoutOverlay ? overlayFocus : null}
            onOverlayFocus={scoutOverlay ? setOverlayFocus : undefined}
            heatmapImage={heatmapBuilt.image}
            utilArcs={heatmapBuilt.arcs}
          />
          <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] border border-transparent px-2.5 text-[12px] tracking-wide text-[var(--muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              <span className="text-base leading-none">‹</span> Matchs
            </Link>
            <Link
              href={`/m/${matchId}/stats`}
              className="pointer-events-auto inline-flex h-8 items-center rounded-[var(--radius)] border border-transparent px-2.5 text-[12px] tracking-wide text-[var(--muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
            >
              Stats
            </Link>
            {!stacked && (
              <CopyRoundLink
                shareCode={shareCode}
                mapName={mapName}
                round={round.number}
                t={(tick - round.freezeEndTick) / replay.tickRate}
                filter={filter}
              />
            )}
            <button
              type="button"
              onClick={toggleCoachTools}
              className={`pointer-events-auto inline-flex h-8 items-center rounded-[var(--radius)] border px-2.5 text-[12px] tracking-wide transition-colors ${
                coachTools || scoutOverlay
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
              }`}
              title="Scout, multiround, patterns"
            >
              Outils coach
            </button>
            {coachTools && (
              <button
                type="button"
                onClick={() => setScoutOpen((o) => !o)}
                className={`pointer-events-auto inline-flex h-8 items-center rounded-[var(--radius)] border px-2.5 text-[12px] tracking-wide transition-colors ${
                  scoutOpen || scoutOverlay
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-transparent text-[var(--muted)] hover:border-[var(--border)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]"
                }`}
              >
                Scout
              </button>
            )}
            <span className="pointer-events-none text-[11px] tracking-[0.08em] text-[var(--muted)] uppercase">
              {mapLabel}
              {scoutOverlay ? (
                <> · Overlay · {enabledLayerCount} round{enabledLayerCount !== 1 ? "s" : ""}</>
              ) : !multi ? (
                <>
                  {` · R${round.number}`}
                  {focusTeam ? (
                    <>
                      {" · "}
                      <span style={{ color: SIDE_COLOR[focusSide] }}>
                        {focusTeam.name} {focusSide}
                      </span>
                    </>
                  ) : null}
                </>
              ) : null}
            </span>
          </div>
          {!stacked && (
            <div className="absolute top-3 right-3">
              <KillFeed replay={replay} round={round} tick={tick} />
            </div>
          )}
          <div className="pointer-events-auto absolute bottom-3 left-3">
            <Toolbar
              tool={tool}
              onTool={setTool}
              drawColor={drawColor}
              onDrawColor={setDrawColor}
              drawShape={drawShape}
              onDrawShape={setDrawShape}
              onClear={() => setStrokes((list) => list.filter((s) => s.round !== round.number))}
              settings={settings}
              onSettings={updateSettings}
              saveState={saveState}
            />
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 space-y-3 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-panel)] py-3 pr-3 pl-2">
          {(scoutOpen || scoutOverlay) && (
            <MapScoutPanel
              matchId={matchId}
              filter={filter}
              onFilterChange={onFilterChange}
              overlayActive={scoutOverlay}
              enabledMatches={enabledMatches}
              highlightedMatchId={overlayFocus?.matchId ?? null}
              overlayLoading={overlayLoading}
              onStartOverlay={startOverlay}
              onStopOverlay={stopOverlay}
              onToggleMatch={toggleMatch}
              onSoloMatch={soloMatch}
            />
          )}
          {scoutOverlay ? (
            <OverlayRoster
              players={overlayPlayers}
              hidden={hiddenPlayers}
              highlightedSteamId={overlayFocus?.steamId ?? null}
              onToggle={togglePlayer}
              onSolo={soloPlayer}
              onShowAll={() => setHiddenPlayers(new Set())}
              onToggleSide={toggleSide}
            />
          ) : multi ? (
            <MultiRoundPanel replay={replay} selected={selected} onSelect={setSelected} filter={filter} />
          ) : (
            <>
              <RoundNotePanel
                shareCode={shareCode}
                mapName={mapName}
                roundNumber={round.number}
                t={(tick - round.freezeEndTick) / replay.tickRate}
                filter={filter}
                value={roundNotes[round.number]?.body ?? ""}
                onChange={(body) => updateRoundNote(round.number, body)}
                saveState={noteSaveState}
                authorName={roundNotes[round.number]?.authorName}
              />
              {teamsBySide.map((t) => (
                <TeamPanel key={t} replay={replay} round={round} tick={tick} team={t} focus={focus} onFocus={setFocus} />
              ))}
            </>
          )}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-[var(--border)] bg-[var(--bg-panel)] px-3 pt-2 pb-2.5">
        <div className="flex items-end gap-2">
          {coachTools && (
            <HeatmapControls
              config={heatmap}
              onChange={setHeatmap}
              players={heatmapPlayers}
              pointCount={heatmapBuilt.grid?.pointCount ?? null}
              roundCount={heatSourceLayers.length}
              arcCount={heatmapBuilt.arcs.length}
            />
          )}
          {!scoutOverlay ? (
            <div className="min-w-0 flex-1">
              <RoundStrip
                replay={replay}
                current={roundIdx}
                multi={multi}
                selected={selected}
                filter={filter}
                onSelect={onSelectRound}
                onToggleMulti={toggleMulti}
                onFilterChange={onFilterChange}
                onFilteredStep={stepFiltered}
                showAdvanced={coachTools}
                notedRounds={notedRounds}
              />
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2 self-center px-0.5 text-[11px] text-[var(--muted)]">
              <span className="font-medium tracking-[0.08em] text-[var(--text)] uppercase">
                Overlay scout
              </span>
              <span className="truncate">
                · menu : toggle · radar : surbrillance · Esc = clear / quitter
              </span>
            </div>
          )}
        </div>
        {scoutOverlay ? (
          <Timeline
            replay={replay}
            round={null}
            from={scoutRange.from * replay.tickRate}
            to={scoutRange.to * replay.tickRate}
            tick={relSeconds * replay.tickRate}
            playing={playing}
            speed={speed}
            clockOverride={formatClock(ROUND_TIME_S - relSeconds)}
            onSeek={(t) => setRelSeconds(t / replay.tickRate)}
            onTogglePlay={() => setPlaying((p) => !p)}
            onSpeed={setSpeed}
          />
        ) : multi ? (
          <Timeline
            replay={replay}
            round={null}
            from={multiRange.from}
            to={multiRange.to}
            tick={relTick}
            playing={playing}
            speed={speed}
            clockOverride={formatClock(ROUND_TIME_S - relTick / replay.tickRate)}
            onSeek={setRelTick}
            onTogglePlay={() => setPlaying((p) => !p)}
            onSpeed={setSpeed}
          />
        ) : (
          <Timeline
            replay={replay}
            round={round}
            from={round.startTick}
            to={round.nextStartTick}
            tick={tick}
            playing={playing}
            speed={speed}
            onSeek={setTick}
            onTogglePlay={() => setPlaying((p) => !p)}
            onSpeed={setSpeed}
          />
        )}
      </div>
    </div>
  );
}

function MultiRoundPanel({
  replay,
  selected,
  onSelect,
  filter,
}: {
  replay: ReplayData;
  selected: number[];
  onSelect: (sel: number[]) => void;
  filter: RoundFilter;
}) {
  const filtered = replay.rounds.map((_, i) => i).filter((i) => roundMatches(replay.rounds[i], filter));
  return (
    <div className="rounded-md border border-[var(--border)] bg-[#0f0f11]">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[13px] font-semibold">Multi round</span>
        <span className="text-xs text-[var(--muted)]">{selected.length} sélectionné(s)</span>
      </div>
      <div className="border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
        Les rounds sont synchronisés sur la fin du freeze time. Clique sur les numéros en bas pour en
        ajouter ou en retirer.
      </div>
      <div className="flex gap-2 border-t border-[var(--border)] px-3 py-2">
        <button className="btn btn-ghost h-7 flex-1 px-2 text-xs" onClick={() => onSelect(filtered)}>
          Rounds filtrés ({filtered.length})
        </button>
        <button className="btn btn-ghost h-7 px-2 text-xs" onClick={() => onSelect([])}>
          Vider
        </button>
      </div>
      {selected.map((i) => {
        const r = replay.rounds[i];
        return (
          <div
            key={i}
            className="flex items-center justify-between border-t border-[var(--border)] px-3 py-1.5 text-xs"
          >
            <span className="font-semibold">Round {r.number}</span>
            <span className="flex items-center gap-2 text-[var(--muted)]">
              {replay.teams.map((t) => (
                <span key={t.key} style={{ color: SIDE_COLOR[r.sideOf[t.key]] }}>
                  {r.buy[t.key]}
                </span>
              ))}
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: r.winnerSide ? SIDE_COLOR[r.winnerSide] : "transparent" }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
