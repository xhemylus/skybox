import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/redis";
import { isSafeRelativePath } from "@/lib/safePath";
import { steamLoginUrl } from "@/lib/steam";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ip = clientIp(req);
  if (!(await rateLimit(`rl:steam-login:${ip}`, 40, 60))) {
    return NextResponse.redirect(new URL("/login?error=rate_limited", env.appUrl));
  }

  const invite = url.searchParams.get("invite") ?? undefined;
  const nextRaw = url.searchParams.get("next") ?? undefined;
  const next = nextRaw && isSafeRelativePath(nextRaw) ? nextRaw : undefined;
  return NextResponse.redirect(steamLoginUrl({ inviteToken: invite, returnPath: next }));
}
