import { redirect, notFound } from "next/navigation";
import {
  MatchReplayView,
  canManageTeam,
  findTeamMatchByShareCode,
} from "@/components/MatchReplayView";
import { parseShareSlug } from "@/components/replayer/shareUrl";
import { getSessionUser } from "@/lib/auth";

export default async function ShareRoundPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string; slug?: string[] }>;
  searchParams: Promise<{
    team?: string;
    side?: string;
    buy?: string;
    oppBuy?: string;
    t?: string;
    round?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.team) redirect("/team");

  const { code, slug } = await params;
  const sp = await searchParams;
  const match = await findTeamMatchByShareCode(user.team.id, code);
  if (!match) notFound();

  const parsed = parseShareSlug(slug);
  const initialRound =
    parsed.round ?? (sp.round ? Number(sp.round) : null);
  const initialSeconds =
    parsed.seconds ?? (sp.t != null && sp.t !== "" ? Number(sp.t) : null);

  return (
    <MatchReplayView
      match={match}
      canReparse={Boolean(user.role && canManageTeam(user.role))}
      initialRound={initialRound != null && Number.isFinite(initialRound) ? initialRound : null}
      initialSeconds={
        initialSeconds != null && Number.isFinite(initialSeconds) && initialSeconds >= 0
          ? initialSeconds
          : null
      }
      query={sp}
    />
  );
}
