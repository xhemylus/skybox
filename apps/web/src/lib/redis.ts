import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { env } from "./env";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
  }
  return client;
}

/** Returns true if under limit; false if rate-limited. */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  try {
    const redis = getRedis();
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSec);
    return n <= limit;
  } catch (err) {
    console.error("[rateLimit] redis error — allowing request", err);
    return true;
  }
}

/** Claim an OpenID response_nonce once. Returns false if already seen. */
export async function claimOpenIdNonce(nonce: string): Promise<boolean> {
  try {
    const redis = getRedis();
    // Steam nonces are typically timestamped; keep 24h
    const ok = await redis.set(`openid:nonce:${nonce}`, "1", "EX", 86400, "NX");
    return ok === "OK";
  } catch (err) {
    console.error("[openid] nonce store failed — rejecting for safety", err);
    return false;
  }
}

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/** Redis NX lock. Returns an owner token if acquired, null otherwise. */
export async function acquireLock(key: string, ttlSec: number): Promise<string | null> {
  const token = randomUUID();
  try {
    const ok = await getRedis().set(key, token, "EX", ttlSec, "NX");
    return ok === "OK" ? token : null;
  } catch (err) {
    console.error("[lock] acquire failed — denying for safety", err);
    return null;
  }
}

// Delete only if we still own it — the TTL may have expired and another request re-acquired.
const RELEASE_LOCK_LUA = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export async function releaseLock(key: string, token: string): Promise<void> {
  try {
    await getRedis().eval(RELEASE_LOCK_LUA, 1, key, token);
  } catch (err) {
    console.error("[lock] release failed", err);
  }
}
