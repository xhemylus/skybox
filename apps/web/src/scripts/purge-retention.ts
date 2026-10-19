import "dotenv/config";
import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { matches } from "../db/schema";
import { env } from "../lib/env";
import { deleteObject } from "../lib/s3";

/**
 * Deletes matches older than DEMO_RETENTION_DAYS.
 * Run via cron: `npx tsx apps/web/src/scripts/purge-retention.ts`
 */
async function main() {
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

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
