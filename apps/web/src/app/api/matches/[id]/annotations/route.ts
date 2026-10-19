import { and, eq } from "drizzle-orm";
import { AnnotationsPayloadSchema } from "@skybox/shared";
import { db } from "@/db/client";
import { annotations, matches } from "@/db/schema";
import { requireTeamUser } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireTeamUser();
    const { id } = await ctx.params;

    const [match] = await db
      .select()
      .from(matches)
      .where(and(eq(matches.id, id), eq(matches.teamId, user.team.id)))
      .limit(1);

    if (!match) return jsonError("Match introuvable", 404);

    const body = await req.json();
    const parsed = AnnotationsPayloadSchema.safeParse(body);
    if (!parsed.success) return jsonError("Annotations invalides");

    const [existing] = await db
      .select()
      .from(annotations)
      .where(eq(annotations.matchId, id))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(annotations)
        .set({
          payload: parsed.data,
          authorId: user.id,
          updatedAt: new Date(),
        })
        .where(eq(annotations.id, existing.id))
        .returning();
      return jsonOk({ annotations: row.payload });
    }

    const [row] = await db
      .insert(annotations)
      .values({
        matchId: id,
        authorId: user.id,
        payload: parsed.data,
      })
      .returning();

    return jsonOk({ annotations: row.payload });
  } catch (err) {
    return handleRouteError(err);
  }
}
