import type { TeamRole } from "@skybox/shared";

/** Role hierarchy — pure, safe to import from client components. */
const ROLE_RANK: Record<TeamRole, number> = {
  player: 1,
  manager: 2,
  coach: 3,
  admin: 4,
};

export function canManageTeam(role: TeamRole) {
  return role === "admin" || role === "coach" || role === "manager";
}

export function canDeleteMatch(role: TeamRole) {
  return role === "admin" || role === "coach" || role === "manager";
}

/** Whether `actor` may grant `target` via invite. Admin-only for admin invites. */
export function canAssignRole(actor: TeamRole, target: TeamRole): boolean {
  if (target === "admin") return actor === "admin";
  return ROLE_RANK[actor] >= ROLE_RANK[target];
}

/** Whether `actor` may change or remove a member currently holding `target`. */
export function canManageMember(actor: TeamRole, target: TeamRole): boolean {
  return canManageTeam(actor) && canAssignRole(actor, target);
}

export function rolesAssignableBy(actor: TeamRole): TeamRole[] {
  return (["player", "manager", "coach", "admin"] as TeamRole[]).filter((r) =>
    canAssignRole(actor, r),
  );
}
