import { and, eq, ne, sql } from "drizzle-orm";
import { TeamRole } from "@skybox/shared";
import { db } from "@/db/client";
import { teamMembers } from "@/db/schema";
import { canAssignRole, canManageMember, requireTeamUser } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

async function loadMember(id: string, teamId: string) {
  const [member] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.id, id), eq(teamMembers.teamId, teamId)))
    .limit(1);
  return member ?? null;
}

async function otherAdminCount(teamId: string, memberId: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, teamId),
        eq(teamMembers.role, "admin"),
        ne(teamMembers.id, memberId),
      ),
    );
  return Number(count);
}

/** Change a member's role. */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const actor = await requireTeamUser();
    const { id } = await ctx.params;

    const member = await loadMember(id, actor.team.id);
    if (!member) return jsonError("Membre introuvable", 404);
    if (!canManageMember(actor.role, member.role as TeamRole)) {
      return jsonError("Permission refusée", 403);
    }

    const body = (await req.json()) as { role?: string };
    const roleParse = TeamRole.safeParse(body.role);
    if (!roleParse.success) return jsonError("Rôle invalide");
    if (!canAssignRole(actor.role, roleParse.data)) {
      return jsonError("Tu ne peux pas attribuer ce rôle.", 403);
    }

    if (
      member.role === "admin" &&
      roleParse.data !== "admin" &&
      (await otherAdminCount(actor.team.id, member.id)) === 0
    ) {
      return jsonError("L'équipe doit garder au moins un admin.", 409);
    }

    const [updated] = await db
      .update(teamMembers)
      .set({ role: roleParse.data })
      .where(eq(teamMembers.id, member.id))
      .returning();
    return jsonOk({ member: { id: updated.id, role: updated.role } });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Remove a member from the team (revokes access immediately). */
export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const actor = await requireTeamUser();
    const { id } = await ctx.params;

    const member = await loadMember(id, actor.team.id);
    if (!member) return jsonError("Membre introuvable", 404);

    const isSelf = member.userId === actor.id;
    if (!isSelf && !canManageMember(actor.role, member.role as TeamRole)) {
      return jsonError("Permission refusée", 403);
    }
    if (member.role === "admin" && (await otherAdminCount(actor.team.id, member.id)) === 0) {
      return jsonError("L'équipe doit garder au moins un admin.", 409);
    }

    await db.delete(teamMembers).where(eq(teamMembers.id, member.id));
    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
