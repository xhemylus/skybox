import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { matches } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";

export default async function ReplayerIndexPage() {
  const user = await getSessionUser();
  if (!user?.team) redirect("/team");

  const [latest] = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.teamId, user.team.id), eq(matches.parseStatus, "ready")))
    .orderBy(desc(matches.createdAt))
    .limit(1);

  redirect(latest ? `/m/${latest.id}` : "/dashboard");
}
