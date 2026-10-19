import { jsonOk } from "@/lib/api";

export async function GET() {
  return jsonOk({
    ok: true,
    service: "skybox-web",
    maxDemoSizeMb: Number(process.env.MAX_DEMO_SIZE_MB ?? "512"),
    retentionDays: Number(process.env.DEMO_RETENTION_DAYS ?? "90"),
  });
}
