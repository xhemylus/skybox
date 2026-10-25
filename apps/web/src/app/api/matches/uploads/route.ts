import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireTeamUser } from "@/lib/auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { assertValidDemo, demoKeyFor } from "@/lib/demoUpload";
import { clientIp, rateLimit } from "@/lib/redis";
import { presignPut } from "@/lib/s3";

const Body = z.object({
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
});

/**
 * Step 1 of an upload: returns a presigned URL so the browser sends the demo
 * straight to object storage — the web process never holds the file in RAM.
 */
export async function POST(req: Request) {
  try {
    const user = await requireTeamUser();

    if (!(await rateLimit(`rl:upload:${user.id}`, 30, 3600))) {
      return jsonError("Trop d'uploads — réessaie plus tard.", 429);
    }
    if (!(await rateLimit(`rl:upload-ip:${clientIp(req)}`, 60, 3600))) {
      return jsonError("Trop d'uploads — réessaie plus tard.", 429);
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return jsonError("Requête invalide");
    const { filename, size } = parsed.data;
    assertValidDemo(filename, size);

    const uploadId = randomUUID();
    const url = await presignPut(demoKeyFor(user.team.id, uploadId, filename), size);
    return jsonOk({ uploadId, url, headers: { "Content-Type": "application/octet-stream" } });
  } catch (err) {
    return handleRouteError(err);
  }
}
