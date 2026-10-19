import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    // Fail closed if migrations lag behind the app (e.g. parse_progress).
    await db.execute(sql`select parse_progress, share_code from matches limit 0`);
  } catch {
    return jsonError(
      "Schéma DB obsolète — lance npm run db:migrate puis redémarre les services.",
      503,
      { ok: false, db: false },
    );
  }

  return jsonOk({
    ok: true,
    db: true,
    service: "skybox-web",
    maxDemoSizeMb: Number(process.env.MAX_DEMO_SIZE_MB ?? "512"),
    retentionDays: Number(process.env.DEMO_RETENTION_DAYS ?? "90"),
  });
}
