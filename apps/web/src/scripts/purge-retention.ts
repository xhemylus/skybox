import "dotenv/config";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "../db/client";
import { matches } from "../db/schema";
import { env } from "../lib/env";
import { deleteObject, s3 } from "../lib/s3";

/** Uploads not registered as a match after this long were abandoned by the browser. */
const ORPHAN_UPLOAD_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes demos/{teamId}/{matchId}/… objects with no matching row (upload started,
 * never completed — or the row was deleted while storage cleanup failed).
 */
async function purgeOrphanUploads() {
  const cutoff = Date.now() - ORPHAN_UPLOAD_MS;
  let token: string | undefined;
  let deleted = 0;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.s3.bucket,
        Prefix: "demos/",
        ContinuationToken: token,
      }),
    );
    token = page.NextContinuationToken;

    const old = (page.Contents ?? []).filter(
      (o) => o.Key && o.LastModified && o.LastModified.getTime() < cutoff,
    );
    const ids = [...new Set(old.map((o) => o.Key!.split("/")[2]).filter(isUuid))];
    if (!ids.length) continue;

    const known = new Set(
      (await db.select({ id: matches.id }).from(matches).where(inArray(matches.id, ids))).map(
        (m) => m.id,
      ),
    );
    for (const o of old) {
      const id = o.Key!.split("/")[2];
      if (!isUuid(id) || known.has(id)) continue;
      await deleteObject(o.Key!).catch((err) => console.warn("orphan delete failed", o.Key, err));
      deleted++;
    }
  } while (token);
  console.log(`Orphan uploads — deleted ${deleted} object(s)`);
}

function isUuid(s: string | undefined): s is string {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Deletes matches older than DEMO_RETENTION_DAYS, then orphaned uploads.
 * Runs daily via deploy/demoreviewer-purge.timer (`npm run purge:retention`).
 */
async function purgeOldMatches() {
  const cutoff = new Date(
    Date.now() - env.demoRetentionDays * 24 * 60 * 60 * 1000,
  );
  const old = await db
    .select()
    .from(matches)
    .where(lt(matches.createdAt, cutoff));

  console.log(
    `Retention ${env.demoRetentionDays}d — deleting ${old.length} match(es) older than ${cutoff.toISOString()}`,
  );

  for (const m of old) {
    try {
      await deleteObject(m.demoKey);
      if (m.replayKey) await deleteObject(m.replayKey);
    } catch (err) {
      console.warn("storage cleanup failed", m.id, err);
    }
    await db.delete(matches).where(and(eq(matches.id, m.id)));
    console.log("deleted", m.id, m.filename);
  }
}

async function main() {
  if (env.demoRetentionDays > 0) {
    await purgeOldMatches();
  } else {
    console.log("DEMO_RETENTION_DAYS=0 — old matches kept");
  }
  await purgeOrphanUploads();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
