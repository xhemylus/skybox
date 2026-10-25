import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { invites } from "@/db/schema";
import { canManageTeam, requireTeamUser } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/** Revoke a pending invite link. */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireTeamUser();
    if (!canManageTeam(user.role)) return jsonError("Permission refusée", 403);
    const { id } = await ctx.params;

    const [deleted] = await db
      .delete(invites)
      .where(
        and(eq(invites.id, id), eq(invites.teamId, user.team.id), isNull(invites.acceptedAt)),
      )
      .returning({ id: invites.id });
    if (!deleted) return jsonError("Invitation introuvable", 404);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
