import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { matches } from "@/db/schema";
import { requireTeamUser } from "@/lib/auth";
import { handleRouteError, jsonError } from "@/lib/api";
import { normalizeTeamKey } from "@/lib/teamIdentity";
import { loadTeamMapScout } from "@/lib/teamStats";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Cross-demo scout for one team of this match on the same map. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireTeamUser();
    const { id } = await ctx.params;
    const teamParam = new URL(req.url).searchParams.get("team"); // A | B
    if (teamParam !== "A" && teamParam !== "B") {
      return jsonError("Paramètre team=A|B requis", 400);
    }

    const [match] = await db
      .select({
        id: matches.id,
        mapName: matches.mapName,
        teamAName: matches.teamAName,
        teamBName: matches.teamBName,
        teamId: matches.teamId,
      })
      .from(matches)
      .where(and(eq(matches.id, id), eq(matches.teamId, user.team.id)))
      .limit(1);
    if (!match) return jsonError("Match introuvable", 404);
    if (!match.mapName) return jsonError("Map inconnue", 400);

    const rawName = teamParam === "A" ? match.teamAName : match.teamBName;
    if (!normalizeTeamKey(rawName)) return jsonError("Nom d'équipe manquant", 400);

    const scout = await loadTeamMapScout(user.team.id, rawName!, match.mapName);
    if (!scout) return jsonError("Aucune donnée scout", 404);

    return Response.json({
      teamName: scout.teamName,
      mapName: scout.mapName,
      matchCount: scout.matchCount,
      rounds: scout.rounds.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
