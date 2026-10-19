import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./client";
import { invites, teamMembers, teams, users } from "./schema";
import { parseSteamId } from "../lib/steam";

async function main() {
  const teamName = process.env.SEED_TEAM_NAME ?? "Team Local";
  const rawSteam = process.env.SEED_ADMIN_STEAM_ID?.trim();
  const adminSteamId = rawSteam ? parseSteamId(rawSteam) : null;

  if (rawSteam && !adminSteamId) {
    throw new Error(
      `SEED_ADMIN_STEAM_ID invalide: ${rawSteam} (attendu SteamID64 ou URL /profiles/…)`,
    );
  }

  let [team] = await db.select().from(teams).limit(1);
  if (!team) {
    [team] = await db.insert(teams).values({ name: teamName }).returning();
  }

  if (adminSteamId) {
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.steamId, adminSteamId))
      .limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({ steamId: adminSteamId, name: "Coach" })
        .returning();
    }

    const [membership] = await db
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.userId, user.id))
      .limit(1);

    if (!membership) {
      await db.insert(teamMembers).values({
        teamId: team.id,
        userId: user.id,
        role: "admin",
      });
    }

    console.log("Seed complete");
    console.log(`Admin SteamID: ${adminSteamId}`);
    console.log(`Team: ${team.name} (${team.id})`);
    console.log("Connecte-toi via /login → Continuer avec Steam");
  } else {
    console.log("Seed complete (équipe seule)");
    console.log(`Team: ${team.name} (${team.id})`);
    console.log(
      "Aucun SEED_ADMIN_STEAM_ID — le premier compte Steam qui se connecte devient admin (bootstrap).",
    );
  }

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(invites).values({
    teamId: team.id,
    steamId: null,
    role: "player",
    token,
    expiresAt,
  });

  console.log(`Sample invite URL: ${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
