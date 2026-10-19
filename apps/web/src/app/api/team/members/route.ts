import { and, eq } from "drizzle-orm";
import { TeamRole } from "@skybox/shared";
import { db } from "@/db/client";
import { teamMembers, users } from "@/db/schema";
import {
  canAssignRole,
  canManageTeam,
  requireTeamUser,
} from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/redis";
import { fetchSteamProfile, parseSteamId } from "@/lib/steam";

export async function GET() {
  try {
    const user = await requireTeamUser();
    const rows = await db
      .select({
        id: teamMembers.id,
        role: teamMembers.role,
        steamId: users.steamId,
        name: users.name,
        avatarUrl: users.avatarUrl,
        userId: users.id,
      })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, user.team.id));
    return jsonOk({ members: rows });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Add a member immediately by SteamID — no invite acceptance required. */
export async function POST(req: Request) {
  try {
    const actor = await requireTeamUser();
    if (!canManageTeam(actor.role)) {
      return jsonError("Permission refusée", 403);
    }

    if (!(await rateLimit(`rl:add-member:${actor.id}`, 60, 3600))) {
      return jsonError("Trop d'ajouts — réessaie plus tard.", 429);
    }
    if (!(await rateLimit(`rl:add-member-ip:${clientIp(req)}`, 80, 3600))) {
      return jsonError("Trop d'ajouts — réessaie plus tard.", 429);
    }

    const body = (await req.json()) as { steamId?: string; role?: string };
    const steamId = body.steamId?.trim() ? parseSteamId(body.steamId) : null;
    if (!steamId) {
      return jsonError("SteamID64 ou URL profil Steam requis");
    }

    const roleParse = TeamRole.safeParse(body.role ?? "player");
    if (!roleParse.success) return jsonError("Rôle invalide");
    if (!canAssignRole(actor.role, roleParse.data)) {
      return jsonError("Tu ne peux pas attribuer ce rôle.", 403);
    }

    let [memberUser] = await db.select().from(users).where(eq(users.steamId, steamId)).limit(1);
    if (!memberUser) {
      const profile = await fetchSteamProfile(steamId);
      [memberUser] = await db
        .insert(users)
        .values({
          steamId,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
        })
        .returning();
    }

    const [existing] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, actor.team.id), eq(teamMembers.userId, memberUser.id)))
      .limit(1);

    if (existing) {
      return jsonError("Ce compte est déjà dans l'équipe.", 409);
    }

    const [membership] = await db
      .insert(teamMembers)
      .values({
        teamId: actor.team.id,
        userId: memberUser.id,
        role: roleParse.data,
      })
      .returning();

    return jsonOk({
      member: {
        id: membership.id,
        role: membership.role,
        steamId: memberUser.steamId,
        name: memberUser.name,
        avatarUrl: memberUser.avatarUrl,
        userId: memberUser.id,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
