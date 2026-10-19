import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { MatchList } from "@/components/MatchList";
import { UploadDemo } from "@/components/UploadDemo";
import { db } from "@/db/client";
import { matches } from "@/db/schema";
import { canManageTeam, getSessionUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.team) redirect("/team");

  const rows = await db
    .select()
    .from(matches)
    .where(eq(matches.teamId, user.team.id))
    .orderBy(desc(matches.createdAt));

  const readyCount = rows.filter((m) => m.parseStatus === "ready").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-shell space-y-8">
        <header>
          <p className="section-label mb-2">Bibliothèque</p>
          <h1 className="page-title">Matchs</h1>
          <p className="muted mt-2 text-sm">Démos privées de {user.team.name}</p>
        </header>

        <UploadDemo />

        {readyCount > 0 && (
          <div className="panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="section-label">Scout</p>
              <p className="mt-1 text-sm text-[var(--text)]">
                Pistols, buys et starts par adversaire et par map.
              </p>
            </div>
            <Link href="/teams" className="btn btn-ghost">
              Voir les adversaires →
            </Link>
          </div>
        )}

        <MatchList matches={rows} canManage={user.role ? canManageTeam(user.role) : false} />
      </div>
    </div>
  );
}
