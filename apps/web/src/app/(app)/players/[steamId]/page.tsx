import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PlayerProfileView } from "@/components/PlayerProfileView";
import { getSessionUser } from "@/lib/auth";
import { loadPlayerProfile } from "@/lib/playerStats";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ steamId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.team) redirect("/team");

  const { steamId } = await params;
  if (!/^7656119\d{10}$/.test(steamId)) notFound();

  const profile = await loadPlayerProfile(user.team.id, steamId);
  if (!profile) notFound();

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-shell space-y-6">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/stats" className="text-[var(--muted)] transition-colors hover:text-[var(--text)]">
            ‹ Player Stats
          </Link>
        </div>
        <PlayerProfileView profile={profile} />
      </div>
    </div>
  );
}
