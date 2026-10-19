import { and, eq } from "drizzle-orm";
import { ParseStatusView } from "@/components/ParseStatusView";
import { Replayer, type RoundNoteMap } from "@/components/replayer/Replayer";
import { UnsupportedMap } from "@/components/replayer/UnsupportedMap";
import { db } from "@/db/client";
import { annotations, matches, roundNotes, users, type Match } from "@/db/schema";
import { mapLabel } from "@/lib/format";
import { isMapSupported, type BuyType, type PaintStroke, type Side, type TeamKey } from "@skybox/shared";
import { canManageTeam } from "@/lib/auth";

export { canManageTeam };

export type ReplayQuery = {
  round?: string | null;
  t?: string | null;
  team?: string | null;
  side?: string | null;
  buy?: string | null;
  oppBuy?: string | null;
};

function parseFilter(sp: ReplayQuery) {
  return {
    team: (sp.team === "B" ? "B" : sp.team === "A" ? "A" : null) as TeamKey | null,
    side: (sp.side === "CT" || sp.side === "T" ? sp.side : null) as Side | null,
    buy: (["pistol", "eco", "force", "full"].includes(sp.buy ?? "") ? sp.buy : null) as BuyType | null,
    oppBuy: (["pistol", "eco", "force", "full"].includes(sp.oppBuy ?? "")
      ? sp.oppBuy
      : null) as BuyType | null,
  };
}

export async function MatchReplayView({
  match,
  canReparse,
  initialRound,
  initialSeconds,
  query,
}: {
  match: Match;
  canReparse: boolean;
  initialRound?: number | null;
  initialSeconds?: number | null;
  query?: ReplayQuery;
}) {
  const sp = query ?? {};
  const fromQueryRound = sp.round ? Number(sp.round) : null;
  const fromQuerySeconds = sp.t != null && sp.t !== "" ? Number(sp.t) : null;
  const round =
    initialRound != null && Number.isFinite(initialRound)
      ? initialRound
      : fromQueryRound != null && Number.isFinite(fromQueryRound)
        ? fromQueryRound
        : null;
  const seconds =
    initialSeconds != null && Number.isFinite(initialSeconds) && initialSeconds >= 0
      ? initialSeconds
      : fromQuerySeconds != null && Number.isFinite(fromQuerySeconds) && fromQuerySeconds >= 0
        ? fromQuerySeconds
        : null;

  if (match.parseStatus !== "ready") {
    return (
      <ParseStatusView
        matchId={match.id}
        status={match.parseStatus}
        error={match.parseError}
        progress={match.parseProgress}
        stage={match.parseStage}
        canReparse={canReparse}
      />
    );
  }

  if (!isMapSupported(match.mapName)) {
    return <UnsupportedMap map={match.mapName ?? "unknown"} />;
  }

  const [annotation, noteRows] = await Promise.all([
    db
      .select()
      .from(annotations)
      .where(eq(annotations.matchId, match.id))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({
        roundNumber: roundNotes.roundNumber,
        body: roundNotes.body,
        authorName: users.name,
        updatedAt: roundNotes.updatedAt,
      })
      .from(roundNotes)
      .leftJoin(users, eq(users.id, roundNotes.authorId))
      .where(eq(roundNotes.matchId, match.id)),
  ]);

  const strokes = ((annotation?.payload as { strokes?: PaintStroke[] } | undefined)?.strokes ??
    []) as PaintStroke[];

  const initialRoundNotes: RoundNoteMap = {};
  for (const n of noteRows) {
    if (!n.body.trim()) continue;
    initialRoundNotes[n.roundNumber] = {
      body: n.body,
      authorName: n.authorName,
      updatedAt: n.updatedAt.toISOString(),
    };
  }

  return (
    <Replayer
      matchId={match.id}
      shareCode={match.shareCode}
      mapName={match.mapName}
      mapLabel={mapLabel(match.mapName)}
      initialStrokes={strokes}
      initialRoundNotes={initialRoundNotes}
      teamAName={match.teamAName}
      teamBName={match.teamBName}
      initialRound={round}
      initialSeconds={seconds}
      initialFilter={parseFilter(sp)}
    />
  );
}

export async function findTeamMatch(teamId: string, id: string) {
  const [match] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.id, id), eq(matches.teamId, teamId)))
    .limit(1);
  return match ?? null;
}

export async function findTeamMatchByShareCode(teamId: string, code: string) {
  const [match] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.shareCode, code.toLowerCase()), eq(matches.teamId, teamId)))
    .limit(1);
  return match ?? null;
}
