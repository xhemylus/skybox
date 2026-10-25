import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { matches } from "@/db/schema";
import { requireTeamUser } from "@/lib/auth";
import { HttpError, handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { env } from "@/lib/env";
import { putObject } from "@/lib/s3";
import { enqueueParse } from "@/lib/queue";
import { acquireLock, clientIp, rateLimit, releaseLock } from "@/lib/redis";
import { generateShareCode } from "@/lib/generateShareCode";
import { MIN_DEMO_BYTES } from "@skybox/shared";

export const runtime = "nodejs";

/** One upload at a time on small VPS — parallel demos = OOM/freeze. */
const UPLOAD_LOCK = "lock:upload:global";
const UPLOAD_LOCK_TTL_SEC = 10 * 60;

export async function GET() {
  try {
    const user = await requireTeamUser();
    const rows = await db
      .select()
      .from(matches)
      .where(eq(matches.teamId, user.team.id))
      .orderBy(desc(matches.createdAt));
    return jsonOk({ matches: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireTeamUser();

    if (!(await rateLimit(`rl:upload:${user.id}`, 30, 3600))) {
      return jsonError("Trop d'uploads — réessaie plus tard.", 429);
    }
    if (!(await rateLimit(`rl:upload-ip:${clientIp(req)}`, 60, 3600))) {
      return jsonError("Trop d'uploads — réessaie plus tard.", 429);
    }

    const lockToken = await acquireLock(UPLOAD_LOCK, UPLOAD_LOCK_TTL_SEC);
    if (!lockToken) {
      return jsonError(
        "Un import est déjà en cours. Sur ce serveur, envoie une démo à la fois.",
        429,
      );
    }

    try {
      const form = await req.formData();
      const file = form.get("file");

      if (!(file instanceof File)) {
        throw new HttpError("Fichier .dem requis");
      }

      const name = file.name.toLowerCase();
      if (![".dem", ".zst", ".gz"].some((ext) => name.endsWith(ext))) {
        throw new HttpError("Formats acceptés : .dem, .dem.zst, .dem.gz");
      }

      const maxBytes = env.maxDemoSizeMb * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new HttpError(`Fichier trop volumineux (max ${env.maxDemoSizeMb} Mo)`);
      }
      if (file.size < MIN_DEMO_BYTES) {
        throw new HttpError("Fichier trop petit pour être une démo CS2 complète.");
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      // Uncompressed CS2 demos start with PBDEMS2
      if (name.endsWith(".dem") && !buffer.subarray(0, 7).toString("latin1").startsWith("PBDEMS2")) {
        throw new HttpError("Fichier .dem invalide (signature CS2 attendue).");
      }
      const contentHash = createHash("sha256").update(buffer).digest("hex");

      const [duplicate] = await db
        .select({
          id: matches.id,
          filename: matches.filename,
          parseStatus: matches.parseStatus,
        })
        .from(matches)
        .where(and(eq(matches.teamId, user.team.id), eq(matches.contentHash, contentHash)))
        .limit(1);

      if (duplicate) {
        return jsonError("Cette démo est déjà importée dans l'équipe.", 409, {
          matchId: duplicate.id,
          filename: duplicate.filename,
          parseStatus: duplicate.parseStatus,
        });
      }

      const matchId = randomUUID();
      const safeName =
        file.name
          .replace(/[^a-zA-Z0-9._-]+/g, "_")
          .replace(/^\.+/, "")
          .slice(0, 180) || "demo.dem";
      const demoKey = `demos/${user.team.id}/${matchId}/${safeName}`;
      await putObject(demoKey, buffer, "application/octet-stream");

      let match;
      let lastErr: unknown;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          [match] = await db
            .insert(matches)
            .values({
              id: matchId,
              teamId: user.team.id,
              uploadedBy: user.id,
              filename: file.name,
              shareCode: generateShareCode(8),
              contentHash,
              demoKey,
              parseStatus: "pending",
              parseProgress: 0,
              parseStage: "En file d'attente",
              fileSizeBytes: file.size,
            })
            .returning();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : "";
          // Race: another upload of the same bytes landed first
          if (/unique|duplicate/i.test(msg) && /content_hash|contentHash/i.test(msg)) {
            const [again] = await db
              .select({
                id: matches.id,
                filename: matches.filename,
                parseStatus: matches.parseStatus,
              })
              .from(matches)
              .where(and(eq(matches.teamId, user.team.id), eq(matches.contentHash, contentHash)))
              .limit(1);
            if (again) {
              return jsonError("Cette démo est déjà importée dans l'équipe.", 409, {
                matchId: again.id,
                filename: again.filename,
                parseStatus: again.parseStatus,
              });
            }
          }
          // share_code collision → retry with a new code
          if (/unique|duplicate/i.test(msg) && /share_code/i.test(msg)) continue;
          throw err;
        }
      }
      if (!match) throw lastErr instanceof Error ? lastErr : new Error("Insert match échoué");

      await enqueueParse({
        matchId: match.id,
        teamId: user.team.id,
        demoKey,
      });

      return jsonOk({ match }, { status: 201 });
    } finally {
      await releaseLock(UPLOAD_LOCK, lockToken);
    }
  } catch (err) {
    return handleRouteError(err);
  }
}
