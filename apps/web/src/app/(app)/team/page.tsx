import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { InviteForm } from "@/components/InviteForm";
import { db } from "@/db/client";
import { teamMembers, users } from "@/db/schema";
import { canManageTeam, getSessionUser } from "@/lib/auth";

const ROLE_LABEL: Record<string, string> = {
  player: "Joueur",
  coach: "Coach",
  manager: "Manager",
  admin: "Admin",
};

export default async function TeamPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.team) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="page-shell">
          <div className="panel max-w-lg px-8 py-10">
            <h1 className="page-title">Pas encore d&apos;équipe</h1>
            <p className="muted mt-3 text-sm leading-relaxed">
              Demande un lien d&apos;invitation à un admin de ton équipe pour rejoindre DemoReviewer.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const members = await db
    .select({
      id: teamMembers.id,
      role: teamMembers.role,
      steamId: users.steamId,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, user.team.id));

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-shell">
        <header className="mb-8">
          <p className="section-label mb-2">Organisation</p>
          <h1 className="page-title">{user.team.name}</h1>
          <p className="muted mt-2 text-sm">Roster · 5 joueurs + coach + manager</p>
        </header>
        <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
          <div className="panel overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Membre</th>
                  <th className="px-4 py-3 text-left font-medium">Rôle</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {m.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.avatarUrl}
                            alt=""
                            className="h-8 w-8 rounded-full border border-[var(--border)]"
                          />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--accent)]">
                            {(m.name ?? "?").slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <div className="font-medium">{m.name ?? m.steamId}</div>
                          <div className="muted font-mono text-xs">{m.steamId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge">{ROLE_LABEL[m.role] ?? m.role}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {user.role && canManageTeam(user.role) && <InviteForm actorRole={user.role} />}
        </div>
      </div>
    </div>
  );
}
