"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TeamRole } from "@skybox/shared";

const ROLE_LABEL: Record<TeamRole, string> = {
  player: "Joueur",
  manager: "Manager",
  coach: "Coach",
  admin: "Admin",
};

const ROLE_RANK: Record<TeamRole, number> = {
  player: 1,
  manager: 2,
  coach: 3,
  admin: 4,
};

function canAssign(actor: TeamRole, target: TeamRole) {
  if (target === "admin") return actor === "admin";
  return ROLE_RANK[actor] >= ROLE_RANK[target];
}

function canManage(actor: TeamRole) {
  return actor === "admin" || actor === "coach" || actor === "manager";
}

export type TeamMemberRow = {
  id: string;
  userId: string;
  role: TeamRole;
  steamId: string;
  name: string | null;
  avatarUrl: string | null;
};

export type PendingInviteRow = {
  id: string;
  role: TeamRole;
  steamId: string | null;
  expiresAt: string;
};

export function TeamMembersTable({
  members,
  invites,
  actorRole,
  actorUserId,
}: {
  members: TeamMemberRow[];
  invites: PendingInviteRow[];
  actorRole: TeamRole;
  actorUserId: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assignable = (Object.keys(ROLE_LABEL) as TeamRole[]).filter((r) =>
    canAssign(actorRole, r),
  );

  async function call(id: string, url: string, init: RequestInit) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function changeRole(m: TeamMemberRow, role: TeamRole) {
    void call(m.id, `/api/team/members/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
  }

  async function remove(m: TeamMemberRow) {
    const self = m.userId === actorUserId;
    const label = m.name ?? m.steamId;
    if (!confirm(self ? "Quitter l'équipe ?" : `Retirer ${label} de l'équipe ?`)) return;
    const ok = await call(m.id, `/api/team/members/${m.id}`, { method: "DELETE" });
    if (ok && self) router.push("/team");
  }

  function revoke(inv: PendingInviteRow) {
    if (!confirm("Révoquer cette invitation ?")) return;
    void call(inv.id, `/api/invites/${inv.id}`, { method: "DELETE" });
  }

  return (
    <div className="panel overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)] text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Membre</th>
            <th className="px-4 py-3 text-left font-medium">Rôle</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const self = m.userId === actorUserId;
            const editable = canManage(actorRole) && canAssign(actorRole, m.role);
            return (
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
                  {editable && !self ? (
                    <select
                      className="input h-8 py-0 text-xs"
                      value={m.role}
                      disabled={busyId === m.id}
                      onChange={(e) => changeRole(m, e.target.value as TeamRole)}
                    >
                      {assignable.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="badge">{ROLE_LABEL[m.role] ?? m.role}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {(editable || self) && (
                    <button
                      type="button"
                      className="btn btn-ghost h-8 text-xs text-[var(--danger)]"
                      disabled={busyId === m.id}
                      onClick={() => remove(m)}
                    >
                      {self ? "Quitter" : "Retirer"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {canManage(actorRole) && invites.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-3">
          <p className="section-label mb-2">Invitations en attente</p>
          <ul className="space-y-2 text-sm">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3">
                <span className="muted">
                  {ROLE_LABEL[inv.role]} · {inv.steamId ?? "lien ouvert"} · expire le{" "}
                  {new Date(inv.expiresAt).toLocaleDateString("fr-FR")}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost h-8 text-xs"
                  disabled={busyId === inv.id}
                  onClick={() => revoke(inv)}
                >
                  Révoquer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="px-4 pb-3 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
