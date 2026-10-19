import { destroySession } from "@/lib/auth";
import { jsonOk } from "@/lib/api";

export async function POST() {
  await destroySession();
  return jsonOk({ ok: true });
}
