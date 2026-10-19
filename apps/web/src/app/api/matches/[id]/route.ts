import zlib from "node:zlib";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { annotations, matches, playerMatchStats, rounds } from "@/db/schema";
import { canDeleteMatch, canManageTeam, requireTeamUser } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { deleteObject, getObjectBuffer, putObject } from "@/lib/s3";

type Ctx = { params: Promise<{ id: string }> };

const MatchMetaSchema = z.object({
  teamAName: z.string().trim().min(1).max(64).optional(),
  teamBName: z.string().trim().min(1).max(64).optional(),
  tournament: z.string().trim().max(120).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(24).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

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

    const [roundRows, stats, [annotation]] = await Promise.all([
      db.select().from(rounds).where(eq(rounds.matchId, id)).orderBy(rounds.number),
      db.select().from(playerMatchStats).where(eq(playerMatchStats.matchId, id)),
      db.select().from(annotations).where(eq(annotations.matchId, id)).limit(1),
    ]);

    return jsonOk({
      match,
      rounds: roundRows,
      stats,
      annotations: annotation?.payload ?? { strokes: [] },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireTeamUser();
    if (!canManageTeam(user.role)) return jsonError("Permission refusée", 403);
    const { id } = await ctx.params;

    const [match] = await db
      .select()
      .from(matches)
      .where(and(eq(matches.id, id), eq(matches.teamId, user.team.id)))
      .limit(1);
    if (!match) return jsonError("Match introuvable", 404);

    const parsed = MatchMetaSchema.safeParse(await req.json());
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Données invalides");

    const body = parsed.data;
    const patch: Partial<typeof matches.$inferInsert> = {
      updatedAt: new Date(),
    };

    let namesChanged = false;
    if (body.teamAName != null) {
      patch.teamAName = body.teamAName;
      namesChanged = true;
    }
    if (body.teamBName != null) {
      patch.teamBName = body.teamBName;
      namesChanged = true;
    }
    if (namesChanged) patch.teamNamesLocked = true;

    if (body.tournament !== undefined) {
      patch.tournament = body.tournament?.trim() ? body.tournament.trim() : null;
    }
    if (body.tags !== undefined) patch.tags = normalizeTags(body.tags);
    if (body.notes !== undefined) {
      patch.notes = body.notes?.trim() ? body.notes.trim() : null;
    }

    const [updated] = await db
      .update(matches)
      .set(patch)
      .where(eq(matches.id, id))
      .returning();

    // Keep replay JSON team labels in sync for the 2D viewer
    if (namesChanged && match.replayKey && updated) {
      try {
        const raw = await getObjectBuffer(match.replayKey);
        const json = JSON.parse(zlib.gunzipSync(raw).toString("utf8")) as {
          teams?: { key: string; name: string }[];
        };
        if (Array.isArray(json.teams)) {
          for (const t of json.teams) {
            if (t.key === "A" && updated.teamAName) t.name = updated.teamAName;
            if (t.key === "B" && updated.teamBName) t.name = updated.teamBName;
          }
          await putObject(
            match.replayKey,
            zlib.gzipSync(JSON.stringify(json)),
            "application/json",
            "gzip",
          );
        }
      } catch (err) {
        console.error("[matches] failed to sync replay team names", err);
      }
    }

    return jsonOk({ match: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireTeamUser();
    if (!canDeleteMatch(user.role)) return jsonError("Permission refusée", 403);
    const { id } = await ctx.params;

    const [match] = await db
      .select()
      .from(matches)
      .where(and(eq(matches.id, id), eq(matches.teamId, user.team.id)))
      .limit(1);
    if (!match) return jsonError("Match introuvable", 404);

    await Promise.allSettled([
      deleteObject(match.demoKey),
      match.replayKey ? deleteObject(match.replayKey) : Promise.resolve(),
    ]);

    await db.delete(matches).where(eq(matches.id, id));
    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
