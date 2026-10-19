import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { StatsPanel } from "@/components/StatsPanel";
import { TeamNameLink } from "@/components/TeamNameLink";
import { db } from "@/db/client";
import { matches, playerMatchStats, rounds } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { mapLabel } from "@/lib/format";

export default async function MatchStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.team) redirect("/team");

  const { id } = await params;
  const [match] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.id, id), eq(matches.teamId, user.team.id)))
    .limit(1);

  if (!match) notFound();

  if (match.parseStatus !== "ready") {
    redirect(`/m/${id}`);
  }

  const [statRows, roundRows] = await Promise.all([
    db.select().from(playerMatchStats).where(eq(playerMatchStats.matchId, id)),
    db.select().from(rounds).where(eq(rounds.matchId, id)).orderBy(asc(rounds.number)),
  ]);

  const score =
    match.scoreA != null && match.scoreB != null ? `${match.scoreA}–${match.scoreB}` : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-shell space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="section-label mb-2">Stats match</p>
            <h1 className="page-title">
              <TeamNameLink name={match.teamAName} fallback="Team Alpha" />
              <span className="mx-3 font-sans text-lg text-[var(--muted)]">{score ?? "vs"}</span>
              <TeamNameLink name={match.teamBName} fallback="Team Bravo" />
            </h1>
            <p className="muted mt-2 text-sm">
              {mapLabel(match.mapName)}
              {match.tournament ? ` · ${match.tournament}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href={`/m/${id}`} className="btn btn-primary">
              2D Replay
            </Link>
            <Link href="/dashboard" className="btn btn-ghost">
              Matches
            </Link>
          </div>
        </header>

        {statRows.length === 0 ? (
          <div className="panel px-8 py-12 text-center">
            <p className="font-medium">Pas encore de stats</p>
            <p className="muted mt-1 text-sm">Relance le parse de la démo si besoin.</p>
          </div>
        ) : (
          <StatsPanel
            stats={statRows}
            rounds={roundRows}
            teamAName={match.teamAName}
            teamBName={match.teamBName}
          />
        )}
      </div>
    </div>
  );
}
