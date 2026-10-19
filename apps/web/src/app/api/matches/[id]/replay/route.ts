import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { matches } from "@/db/schema";
import { requireTeamUser } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/api";
import { getObjectBuffer } from "@/lib/s3";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireTeamUser();
    const { id } = await ctx.params;

    const [match] = await db
      .select()
      .from(matches)
      .where(and(eq(matches.id, id), eq(matches.teamId, user.team.id)))
      .limit(1);
    if (!match) return jsonError("Match introuvable", 404);
    if (match.parseStatus !== "ready" || !match.replayKey) {
      return jsonError("Replay pas encore prêt", 409);
    }

    // Stored pre-gzipped by the worker; the browser inflates it transparently.
    let body: Buffer;
    try {
      body = await getObjectBuffer(match.replayKey);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "storage error";
      console.error(`[replay] S3 miss ${id}`, detail);
      return jsonError(
        "Fichier replay introuvable sur le stockage. Relance l'analyse depuis le dashboard.",
        404,
      );
    }
    if (!body?.length) {
      return jsonError("Replay vide. Relance l'analyse depuis le dashboard.", 500);
    }
    const etag = `"${match.id}-${match.updatedAt.getTime()}"`;
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "Cache-Control": "private, no-cache",
        ETag: etag,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
