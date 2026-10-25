import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { TeamRole } from "@skybox/shared";
import { InviteForm } from "@/components/InviteForm";
import { TeamMembersTable } from "@/components/TeamMembersTable";
import { db } from "@/db/client";
import { invites, teamMembers, users } from "@/db/schema";
import { canManageTeam, getSessionUser } from "@/lib/auth";

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
      userId: teamMembers.userId,
      role: teamMembers.role,
      steamId: users.steamId,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, user.team.id));

  const pendingInvites =
    user.role && canManageTeam(user.role)
      ? await db
          .select({
            id: invites.id,
            role: invites.role,
            steamId: invites.steamId,
            expiresAt: invites.expiresAt,
          })
          .from(invites)
          .where(
            and(
              eq(invites.teamId, user.team.id),
              isNull(invites.acceptedAt),
              gt(invites.expiresAt, new Date()),
            ),
          )
          .orderBy(desc(invites.createdAt))
      : [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-shell">
        <header className="mb-8">
          <p className="section-label mb-2">Organisation</p>
          <h1 className="page-title">{user.team.name}</h1>
          <p className="muted mt-2 text-sm">
            Ajoute les SteamID directement — pas besoin qu&apos;ils acceptent une invite.
          </p>
        </header>
        <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
          <TeamMembersTable
            members={members.map((m) => ({ ...m, role: m.role as TeamRole }))}
            invites={pendingInvites.map((i) => ({
              ...i,
              role: i.role as TeamRole,
              expiresAt: i.expiresAt.toISOString(),
            }))}
            actorRole={user.role ?? "player"}
            actorUserId={user.id}
          />
          {user.role && canManageTeam(user.role) && <InviteForm actorRole={user.role} />}
        </div>
      </div>
    </div>
  );
}
