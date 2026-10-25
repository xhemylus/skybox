import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db/client";
import {
  invites,
  sessions,
  teamMembers,
  teams,
  users,
  type Team,
  type User,
} from "@/db/schema";
import { fetchSteamProfile } from "./steam";
import type { TeamRole } from "@skybox/shared";

export {
  canAssignRole,
  canDeleteMatch,
  canManageMember,
  canManageTeam,
  rolesAssignableBy,
} from "./roles";

const SESSION_COOKIE = "skybox_session";
const SESSION_DAYS = 30;

/** Sessions are stored hashed so a DB leak doesn't hand out live cookies. */
function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type SessionUser = User & {
  team: Team | null;
  role: TeamRole | null;
};

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function upsertSteamUser(steamId: string) {
  const profile = await fetchSteamProfile(steamId);
  let [user] = await db.select().from(users).where(eq(users.steamId, steamId)).limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({
        steamId,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      })
      .returning();
  } else {
    [user] = await db
      .update(users)
      .set({
        name: profile.name || user.name,
        avatarUrl: profile.avatarUrl ?? user.avatarUrl,
      })
      .where(eq(users.id, user.id))
      .returning();
  }

  return user;
}

async function attachToTeam(userId: string, teamId: string, role: TeamRole) {
  const [existing] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);

  if (!existing) {
    await db.insert(teamMembers).values({ teamId, userId, role });
  }
}

async function acceptInviteRecord(
  invite: typeof invites.$inferSelect,
  user: User,
) {
  if (invite.steamId && invite.steamId !== user.steamId) {
    throw new AuthError(
      "invite_mismatch",
      "Cette invitation est réservée à un autre compte Steam.",
    );
  }

  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(invites)
      .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt)))
      .for("update")
      .limit(1);

    if (!locked) {
      throw new AuthError("invite_invalid", "Invitation déjà utilisée ou expirée.");
    }

    const [existing] = await tx
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, locked.teamId), eq(teamMembers.userId, user.id)))
      .limit(1);

    if (!existing) {
      await tx.insert(teamMembers).values({
        teamId: locked.teamId,
        userId: user.id,
        role: locked.role as TeamRole,
      });
    }

    const [marked] = await tx
      .update(invites)
      .set({ acceptedAt: new Date(), steamId: user.steamId })
      .where(and(eq(invites.id, locked.id), isNull(invites.acceptedAt)))
      .returning();

    if (!marked) {
      throw new AuthError("invite_invalid", "Invitation déjà utilisée ou expirée.");
    }
  });
}

/**
 * First-user bootstrap:
 * - production: only SEED_ADMIN_STEAM_ID may bootstrap (required)
 * - development: SEED_ADMIN_STEAM_ID if set, else any first Steam user
 */
async function tryBootstrapAdmin(user: User): Promise<boolean> {
  const seed = process.env.SEED_ADMIN_STEAM_ID?.trim();
  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (!seed || seed !== user.steamId) return false;
  } else if (seed && seed !== user.steamId) {
    return false;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamMembers);

  if (Number(count) > 0) return false;

  let [team] = await db.select().from(teams).limit(1);
  if (!team) {
    const name = process.env.SEED_TEAM_NAME ?? "Team Local";
    [team] = await db.insert(teams).values({ name }).returning();
  }

  await attachToTeam(user.id, team.id, "admin");
  return true;
}

/**
 * Complete Steam OpenID login.
 * Access: existing member, matching invite (token or steamId), or first-user bootstrap.
 */
export async function loginWithSteam(steamId: string, inviteToken?: string | null) {
  const user = await upsertSteamUser(steamId);

  if (inviteToken) {
    const [invite] = await db
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.token, inviteToken),
          isNull(invites.acceptedAt),
          gt(invites.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!invite) {
      throw new AuthError("invite_invalid", "Invitation invalide ou expirée.");
    }
    await acceptInviteRecord(invite, user);
    return createSession(user.id);
  }

  const [membership] = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.userId, user.id))
    .limit(1);

  if (membership) {
    return createSession(user.id);
  }

  const [steamInvite] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.steamId, steamId),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (steamInvite) {
    await acceptInviteRecord(steamInvite, user);
    return createSession(user.id);
  }

  const bootstrapped = await tryBootstrapAdmin(user);
  if (bootstrapped) {
    return createSession(user.id);
  }

  throw new AuthError(
    "unauthorized",
    "Compte Steam non autorisé. Demande une invitation à un admin de l'équipe.",
  );
}

export async function createInvite(opts: {
  teamId: string;
  role: TeamRole;
  steamId?: string | null;
}) {
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const [invite] = await db
    .insert(invites)
    .values({
      teamId: opts.teamId,
      steamId: opts.steamId ?? null,
      role: opts.role,
      token,
      expiresAt,
    })
    .returning();
  return invite;
}

async function createSession(userId: string) {
  const token = nanoid(64);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ userId, token: hashSessionToken(token), expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return { token, expiresAt };
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, hashSessionToken(token)));
  }
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, hashSessionToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!session) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return null;

  const [membership] = await db
    .select({
      role: teamMembers.role,
      team: teams,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, user.id))
    .limit(1);

  return {
    ...user,
    team: membership?.team ?? null,
    role: (membership?.role as TeamRole) ?? null,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export async function requireTeamUser(): Promise<SessionUser & { team: Team; role: TeamRole }> {
  const user = await requireUser();
  if (!user.team || !user.role) {
    throw new Error("NO_TEAM");
  }
  return user as SessionUser & { team: Team; role: TeamRole };
}
