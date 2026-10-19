import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { matches } from "@/db/schema";
import { canManageTeam, requireTeamUser } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { enqueueParse } from "@/lib/queue";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireTeamUser();
    if (!canManageTeam(user.role)) return jsonError("Permission refusée", 403);
    const { id } = await ctx.params;

    const [current] = await db
      .select()
      .from(matches)
      .where(and(eq(matches.id, id), eq(matches.teamId, user.team.id)))
      .limit(1);
    if (!current) return jsonError("Match introuvable", 404);
    if (!current.demoKey) return jsonError("Fichier démo manquant — ré-uploade la démo.", 400);
    if (current.parseStatus === "processing") {
      return jsonError("Analyse déjà en cours. Attends un peu.", 409);
    }

    const [match] = await db
      .update(matches)
      .set({
        parseStatus: "pending",
        parseError: null,
        parseProgress: 0,
        parseStage: "En file d'attente",
        updatedAt: new Date(),
      })
      .where(and(eq(matches.id, id), eq(matches.teamId, user.team.id)))
      .returning();
    if (!match) return jsonError("Match introuvable", 404);

    await enqueueParse({ matchId: match.id, teamId: match.teamId, demoKey: match.demoKey });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
