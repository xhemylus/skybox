import path from "node:path";
import zlib from "node:zlib";
import { Worker } from "bullmq";
import { and, eq, inArray, lt } from "drizzle-orm";
import {
  PARSE_QUEUE_NAME,
  humanizeParseError,
  isGenericTeamName,
  type ParseJob,
  type ReplayData,
} from "@skybox/shared";
import { db, matches, playerMatchStats, rounds } from "./db";
import { downloadToFile, materializeDemoFile, withTempDir } from "./demoFile";
import { env } from "./env";
import { parseDemoAsync } from "./runParse";
import { uploadObject } from "./s3";

/** Matches stuck in "processing" longer than this are treated as crashed workers. */
const STALE_PROCESSING_MS = 8 * 60 * 1000;

async function recoverStaleJobs() {
  const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);
  const stale = await db
    .select({ id: matches.id, teamId: matches.teamId, demoKey: matches.demoKey })
    .from(matches)
    .where(and(eq(matches.parseStatus, "processing"), lt(matches.updatedAt, cutoff)));

  if (!stale.length) return;

  console.warn(`[worker] recovering ${stale.length} stale processing job(s)`);
  await db
    .update(matches)
    .set({
      parseStatus: "failed",
      parseError: humanizeParseError(
        "Analyse interrompue (worker redémarré ou timeout). Relance l'analyse.",
      ),
      updatedAt: new Date(),
    })
    .where(
      inArray(
        matches.id,
        stale.map((m) => m.id),
      ),
    );
}

async function setProgress(matchId: string, pct: number, stage: string) {
  await db
    .update(matches)
    .set({
      parseProgress: Math.max(0, Math.min(100, Math.round(pct))),
      parseStage: stage,
      updatedAt: new Date(),
    })
    .where(eq(matches.id, matchId));
}

async function processJob(job: ParseJob) {
  const started = Date.now();
  console.log(`[parse] start ${job.matchId}`);

  const [existing] = await db.select().from(matches).where(eq(matches.id, job.matchId)).limit(1);
  if (!existing) {
    throw new Error(`Match introuvable (${job.matchId})`);
  }
  // Never trust Redis job payload over the DB row
  if (existing.teamId !== job.teamId) {
    throw new Error(
      `teamId mismatch for ${job.matchId}: job=${job.teamId} db=${existing.teamId}`,
    );
  }
  if (!existing.demoKey) {
    throw new Error(`demoKey manquant en base pour ${job.matchId}`);
  }
  if (job.demoKey && existing.demoKey !== job.demoKey) {
    console.warn(
      `[parse] ignoring job.demoKey mismatch for ${job.matchId}: job=${job.demoKey} db=${existing.demoKey}`,
    );
  }

  await db
    .update(matches)
    .set({
      parseStatus: "processing",
      parseError: null,
      parseProgress: 2,
      parseStage: "Démarrage…",
      updatedAt: new Date(),
    })
    .where(eq(matches.id, job.matchId));

  await withTempDir(async (dir) => {
    await setProgress(job.matchId, 5, "Téléchargement de la démo…");
    const rawPath = path.join(dir, "download.bin");
    try {
      await downloadToFile(existing.demoKey, rawPath);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "download failed";
      throw new Error(`Fichier démo introuvable sur le stockage (${detail})`);
    }

    await setProgress(job.matchId, 8, "Préparation fichier…");
    const demoPath = await materializeDemoFile(rawPath, dir);

    let lastPct = 8;
    // parseDemo is CPU-sync (demoparser2). Run it in a worker_thread so
    // setProgress can flush to Postgres — otherwise the UI stays frozen at 5%.
    const replay = await parseDemoAsync(demoPath, existing.filename, async (pct, stage) => {
      const mapped = 10 + Math.round((pct / 100) * 78);
      if (mapped < lastPct + 2 && mapped < 88) return;
      lastPct = mapped;
      await setProgress(job.matchId, mapped, stage);
    });

    // Keep manual team names across reparse when locked
    if (existing.teamNamesLocked) {
      if (existing.teamAName) replay.teams[0].name = existing.teamAName;
      if (existing.teamBName) replay.teams[1].name = existing.teamBName;
    } else {
      applyPreferExisting(replay, existing.teamAName, existing.teamBName);
    }

    await setProgress(job.matchId, 90, "Enregistrement du replay…");
    const replayKey = `parsed/${existing.teamId}/${existing.id}/replay.json.gz`;
    // Buffer + ContentLength — R2 rejects streamed/chunked bodies
    // ("Invalid value undefined for header x-amz-decoded-content-length").
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(replay)), { level: 4 });
    await uploadObject(replayKey, gz, {
      contentType: "application/json",
      contentEncoding: "gzip",
    });

    await setProgress(job.matchId, 95, "Écriture en base…");
    await db.delete(rounds).where(eq(rounds.matchId, job.matchId));
    await db.delete(playerMatchStats).where(eq(playerMatchStats.matchId, job.matchId));

    await db.insert(rounds).values(
      replay.rounds.map((r) => ({
        matchId: job.matchId,
        number: r.number,
        startTick: r.startTick,
        endTick: r.endTick,
        winner: r.winnerSide,
        winnerTeam: r.winnerTeam,
        reason: r.reason,
        sideA: r.sideOf.A,
        buyA: r.buy.A,
        buyB: r.buy.B,
        scoreA: r.scoreA,
        scoreB: r.scoreB,
        bombSite: r.bomb.site,
      })),
    );

    if (replay.stats.length) {
      await db.insert(playerMatchStats).values(
        replay.stats.map((s) => ({ matchId: job.matchId, ...s })),
      );
    }

    const last = replay.rounds[replay.rounds.length - 1];
    await db
      .update(matches)
      .set({
        parseStatus: "ready",
        parseError: null,
        parseProgress: 100,
        parseStage: "Terminé",
        replayKey,
        mapName: replay.map,
        scoreA: last.scoreA,
        scoreB: last.scoreB,
        teamAName: replay.teams[0].name,
        teamBName: replay.teams[1].name,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, job.matchId));

    console.log(
      `[parse] ready ${job.matchId} map=${replay.map} rounds=${replay.rounds.length} ` +
        `score=${last.scoreA}-${last.scoreB} teams=${replay.teams[0].name} vs ${replay.teams[1].name} ` +
        `in ${((Date.now() - started) / 1000).toFixed(1)}s`,
    );
  });
}

function applyPreferExisting(
  replay: ReplayData,
  prevA: string | null | undefined,
  prevB: string | null | undefined,
) {
  const aGeneric =
    isGenericTeamName(replay.teams[0].name) ||
    /^(Team Alpha|Team Bravo)$/i.test(replay.teams[0].name);
  const bGeneric =
    isGenericTeamName(replay.teams[1].name) ||
    /^(Team Alpha|Team Bravo)$/i.test(replay.teams[1].name);
  if (aGeneric && prevA && !isGenericTeamName(prevA) && !/^(Team Alpha|Team Bravo)$/i.test(prevA)) {
    replay.teams[0].name = prevA;
  }
  if (bGeneric && prevB && !isGenericTeamName(prevB) && !/^(Team Alpha|Team Bravo)$/i.test(prevB)) {
    replay.teams[1].name = prevB;
  }
}

const worker = new Worker<ParseJob>(
  PARSE_QUEUE_NAME,
  async (job) => {
    try {
      await processJob(job.data);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Parse failed";
      const message = humanizeParseError(raw);
      console.error(`[parse] failed ${job.data.matchId}`, err);
      try {
        await db
          .update(matches)
          .set({ parseStatus: "failed", parseError: message, updatedAt: new Date() })
          .where(eq(matches.id, job.data.matchId));
      } catch (dbErr) {
        console.error(`[parse] could not persist failure for ${job.data.matchId}`, dbErr);
      }
      throw err;
    }
  },
  {
    connection: { url: env.redisUrl },
    concurrency: 1,
    lockDuration: 10 * 60 * 1000,
  },
);

worker.on("ready", () => {
  console.log("[worker] ready");
  recoverStaleJobs().catch((err) => console.error("[worker] stale recovery failed", err));
});
worker.on("failed", (job, err) => console.error("[worker] job failed", job?.id, err.message));

process.on("SIGINT", async () => {
  await worker.close();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});
