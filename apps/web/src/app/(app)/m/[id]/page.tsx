import { redirect, notFound } from "next/navigation";
import { MatchReplayView, canManageTeam, findTeamMatch } from "@/components/MatchReplayView";
import { getSessionUser } from "@/lib/auth";

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    round?: string;
    t?: string;
    team?: string;
    side?: string;
    buy?: string;
    oppBuy?: string;
  }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.team) redirect("/team");

  const { id } = await params;
  const sp = await searchParams;
  const match = await findTeamMatch(user.team.id, id);
  if (!match) notFound();

  return (
    <MatchReplayView
      match={match}
      canReparse={Boolean(user.role && canManageTeam(user.role))}
      query={sp}
    />
  );
}
