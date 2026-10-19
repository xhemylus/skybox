import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TeamProfileView } from "@/components/TeamProfileView";
import { getSessionUser } from "@/lib/auth";
import { decodeTeamSlug } from "@/lib/teamIdentity";
import { loadTeamProfile } from "@/lib/teamStats";

export default async function TeamProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.team) redirect("/team");

  const { slug } = await params;
  const name = decodeTeamSlug(slug);
  if (!name) notFound();

  const profile = await loadTeamProfile(user.team.id, name);
  if (!profile) notFound();

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-shell space-y-6">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/teams" className="text-[var(--muted)] transition-colors hover:text-[var(--text)]">
            ‹ Adversaires
          </Link>
        </div>
        <TeamProfileView profile={profile} />
      </div>
    </div>
  );
}
