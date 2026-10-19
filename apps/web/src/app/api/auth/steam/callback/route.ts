import { NextResponse } from "next/server";
import { AuthError, loginWithSteam } from "@/lib/auth";
import { env } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/redis";
import { safeRedirectPath } from "@/lib/safePath";
import { verifySteamOpenId } from "@/lib/steam";

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const ip = clientIp(req);
    if (!(await rateLimit(`rl:steam-cb:${ip}`, 30, 60))) {
      return NextResponse.redirect(new URL("/login?error=rate_limited", env.appUrl));
    }

    const steamId = await verifySteamOpenId(url.searchParams);
    const invite = url.searchParams.get("invite");
    await loginWithSteam(steamId, invite);

    const dest = safeRedirectPath(url.searchParams.get("next"));
    return NextResponse.redirect(new URL(dest, env.appUrl));
  } catch (err) {
    const code = err instanceof AuthError ? err.code : "steam_failed";
    console.error("[auth] steam callback failed:", err);
    return NextResponse.redirect(new URL(`/login?error=${code}`, env.appUrl));
  }
}
