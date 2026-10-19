import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { teamMembers, users } from "@/db/schema";
import { requireTeamUser } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/api";

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
