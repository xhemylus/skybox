import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { matches } from "@/db/schema";
import { requireTeamUser } from "@/lib/auth";
import { HttpError, handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { assertValidDemo, demoKeyFor } from "@/lib/demoUpload";
import { deleteObject, getObjectHead, headObjectSize } from "@/lib/s3";
import { enqueueParse } from "@/lib/queue";
import { generateShareCode } from "@/lib/generateShareCode";

export const runtime = "nodejs";

const CompleteBody = z.object({
  uploadId: z.string().uuid(),
  filename: z.string().trim().min(1).max(255),
});

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

/**
 * Step 2 of an upload: the browser has PUT the demo to storage (see ./uploads).
 * Checks the stored object, creates the match and queues the parse. Duplicate
 * detection happens in the worker, which hashes the file while downloading it.
 */
export async function POST(req: Request) {
  try {
    const user = await requireTeamUser();

    const parsed = CompleteBody.safeParse(await req.json());
    if (!parsed.success) return jsonError("Requête invalide");
    const { uploadId, filename } = parsed.data;

    const demoKey = demoKeyFor(user.team.id, uploadId, filename);
    const size = await headObjectSize(demoKey);
    if (size == null) {
      return jsonError("Fichier introuvable sur le stockage — l'envoi a échoué, réessaie.", 404);
    }

    try {
      assertValidDemo(filename, size);
      // Uncompressed CS2 demos start with PBDEMS2
      if (
        filename.toLowerCase().endsWith(".dem") &&
        !(await getObjectHead(demoKey, 7)).toString("latin1").startsWith("PBDEMS2")
      ) {
        throw new HttpError("Fichier .dem invalide (signature CS2 attendue).");
      }
    } catch (err) {
      await deleteObject(demoKey).catch(() => undefined);
      throw err;
    }

    let match;
    for (let attempt = 0; attempt < 5 && !match; attempt++) {
      try {
        [match] = await db
          .insert(matches)
          .values({
            id: uploadId,
            teamId: user.team.id,
            uploadedBy: user.id,
            filename,
            shareCode: generateShareCode(8),
            demoKey,
            parseStatus: "pending",
            parseProgress: 0,
            parseStage: "En file d'attente",
            fileSizeBytes: size,
          })
          .returning();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        // share_code collision → retry with a new code
        if (/unique|duplicate/i.test(msg) && /share_code/i.test(msg)) continue;
        // Same uploadId finalized twice (double click / retry)
        if (/unique|duplicate/i.test(msg) && /pkey/i.test(msg)) {
          return jsonError("Cet envoi est déjà enregistré.", 409, { matchId: uploadId });
        }
        throw err;
      }
    }
    if (!match) throw new Error("Insert match échoué");

    await enqueueParse({ matchId: match.id, teamId: user.team.id, demoKey });
    return jsonOk({ match }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
