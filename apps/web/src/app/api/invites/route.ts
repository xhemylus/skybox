import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { invites } from "@/db/schema";
import {
  canAssignRole,
  canManageTeam,
  createInvite,
  requireTeamUser,
  rolesAssignableBy,
} from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { env } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/redis";
import { parseSteamId } from "@/lib/steam";
import { TeamRole } from "@skybox/shared";

export async function GET() {
  try {
    const user = await requireTeamUser();
    if (!canManageTeam(user.role)) {
      return jsonError("Permission refusée", 403);
    }
    const rows = await db
      .select()
      .from(invites)
      .where(and(eq(invites.teamId, user.team.id), isNull(invites.acceptedAt)))
      .orderBy(desc(invites.createdAt));
    return jsonOk({
      invites: rows,
      assignableRoles: rolesAssignableBy(user.role),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireTeamUser();
    if (!canManageTeam(user.role)) {
      return jsonError("Permission refusée", 403);
    }

    if (!(await rateLimit(`rl:invites:${user.id}`, 40, 3600))) {
      return jsonError("Trop d'invitations — réessaie plus tard.", 429);
    }
    if (!(await rateLimit(`rl:invites-ip:${clientIp(req)}`, 60, 3600))) {
      return jsonError("Trop d'invitations — réessaie plus tard.", 429);
    }

    const body = (await req.json()) as { steamId?: string; role?: string };
    const roleParse = TeamRole.safeParse(body.role ?? "player");
    if (!roleParse.success) return jsonError("Rôle invalide");

    if (!canAssignRole(user.role, roleParse.data)) {
      return jsonError("Tu ne peux pas attribuer ce rôle.", 403);
    }

    let steamId: string | null = null;
    if (body.steamId?.trim()) {
      steamId = parseSteamId(body.steamId);
      if (!steamId) {
        return jsonError("SteamID invalide (SteamID64 ou URL profil steamcommunity.com/profiles/…)");
      }
    }

    const invite = await createInvite({
      teamId: user.team.id,
      role: roleParse.data,
      steamId,
    });

    const url = `${env.appUrl}/invite/${invite.token}`;
    return jsonOk({ invite, url });
  } catch (err) {
    return handleRouteError(err);
  }
}
