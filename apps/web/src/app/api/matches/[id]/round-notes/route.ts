import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { matches, roundNotes, users } from "@/db/schema";
import { requireTeamUser } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

const PutSchema = z.object({
  roundNumber: z.number().int().min(1).max(64),
  body: z.string().max(4000),
});

export type RoundNoteDto = {
  roundNumber: number;
  body: string;
  authorName: string | null;
  updatedAt: string;
};

async function assertMatchAccess(matchId: string, teamId: string) {
  const [match] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.id, matchId), eq(matches.teamId, teamId)))
    .limit(1);
  return match ?? null;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireTeamUser();
    const { id } = await ctx.params;
    if (!(await assertMatchAccess(id, user.team.id))) return jsonError("Match introuvable", 404);

    const rows = await db
      .select({
        roundNumber: roundNotes.roundNumber,
        body: roundNotes.body,
        updatedAt: roundNotes.updatedAt,
        authorName: users.name,
      })
      .from(roundNotes)
      .leftJoin(users, eq(users.id, roundNotes.authorId))
      .where(eq(roundNotes.matchId, id));

    const notes: Record<number, RoundNoteDto> = {};
    for (const r of rows) {
      if (!r.body.trim()) continue;
      notes[r.roundNumber] = {
        roundNumber: r.roundNumber,
        body: r.body,
        authorName: r.authorName,
        updatedAt: r.updatedAt.toISOString(),
      };
    }
    return jsonOk({ notes });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireTeamUser();
    const { id } = await ctx.params;
    if (!(await assertMatchAccess(id, user.team.id))) return jsonError("Match introuvable", 404);

    const parsed = PutSchema.safeParse(await req.json());
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Données invalides");

    const { roundNumber, body } = parsed.data;
    const trimmed = body.trim();

    const [existing] = await db
      .select()
      .from(roundNotes)
      .where(and(eq(roundNotes.matchId, id), eq(roundNotes.roundNumber, roundNumber)))
      .limit(1);

    if (!trimmed) {
      if (existing) {
        await db.delete(roundNotes).where(eq(roundNotes.id, existing.id));
      }
      return jsonOk({ note: null, roundNumber });
    }

    if (existing) {
      const [row] = await db
        .update(roundNotes)
        .set({ body: trimmed, authorId: user.id, updatedAt: new Date() })
        .where(eq(roundNotes.id, existing.id))
        .returning();
      return jsonOk({
        note: {
          roundNumber: row.roundNumber,
          body: row.body,
          authorName: user.name,
          updatedAt: row.updatedAt.toISOString(),
        } satisfies RoundNoteDto,
      });
    }

    const [row] = await db
      .insert(roundNotes)
      .values({
        matchId: id,
        roundNumber,
        body: trimmed,
        authorId: user.id,
      })
      .returning();

    return jsonOk({
      note: {
        roundNumber: row.roundNumber,
        body: row.body,
        authorName: user.name,
        updatedAt: row.updatedAt.toISOString(),
      } satisfies RoundNoteDto,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
