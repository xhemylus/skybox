import { env } from "./env";
import { claimOpenIdNonce } from "./redis";
import { isSafeRelativePath } from "./safePath";

const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const CLAIMED_ID_RE = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/** SteamID64 or profile URL → SteamID64 */
export function parseSteamId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const fromUrl = raw.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (fromUrl) return fromUrl[1];
  if (/^7656119\d{10}$/.test(raw)) return raw;
  return null;
}

export function isSteamId64(id: string): boolean {
  return /^7656119\d{10}$/.test(id);
}

export function steamLoginUrl(opts?: { inviteToken?: string; returnPath?: string }): string {
  const returnTo = new URL("/api/auth/steam/callback", env.appUrl);
  if (opts?.inviteToken) returnTo.searchParams.set("invite", opts.inviteToken);
  if (opts?.returnPath && isSafeRelativePath(opts.returnPath)) {
    returnTo.searchParams.set("next", opts.returnPath);
  }

  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo.toString(),
    "openid.realm": env.appUrl.replace(/\/$/, ""),
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID}?${params.toString()}`;
}

export function extractSteamIdFromClaimedId(claimedId: string | null): string | null {
  if (!claimedId) return null;
  const m = claimedId.trim().match(CLAIMED_ID_RE);
  return m?.[1] ?? null;
}

function assertValidReturnTo(returnTo: string | null) {
  if (!returnTo) throw new Error("openid.return_to manquant");
  let url: URL;
  try {
    url = new URL(returnTo);
  } catch {
    throw new Error("openid.return_to invalide");
  }
  const expected = new URL("/api/auth/steam/callback", env.appUrl);
  if (url.origin !== expected.origin || url.pathname !== expected.pathname) {
    throw new Error("openid.return_to ne correspond pas à l'application");
  }
  for (const key of url.searchParams.keys()) {
    if (key !== "invite" && key !== "next") {
      throw new Error("openid.return_to contient des paramètres inattendus");
    }
  }
  const next = url.searchParams.get("next");
  if (next && !isSafeRelativePath(next)) {
    throw new Error("Paramètre next invalide dans return_to");
  }
}

/** Verify Steam OpenID assertion (check_authentication + binding checks). */
export async function verifySteamOpenId(query: URLSearchParams): Promise<string> {
  if (query.get("openid.mode") !== "id_res") {
    throw new Error("Réponse Steam invalide");
  }

  const opEndpoint = query.get("openid.op_endpoint");
  if (opEndpoint !== STEAM_OPENID) {
    throw new Error("openid.op_endpoint invalide");
  }

  const claimedRaw = query.get("openid.claimed_id");
  const identityRaw = query.get("openid.identity");
  if (!claimedRaw || claimedRaw !== identityRaw) {
    throw new Error("claimed_id / identity OpenID incohérents");
  }

  const claimedId = extractSteamIdFromClaimedId(claimedRaw);
  if (!claimedId) {
    throw new Error("SteamID introuvable dans la réponse OpenID");
  }

  assertValidReturnTo(query.get("openid.return_to"));

  const nonce = query.get("openid.response_nonce");
  if (!nonce || nonce.length > 256) {
    throw new Error("openid.response_nonce manquant");
  }
  if (!(await claimOpenIdNonce(nonce))) {
    throw new Error("Nonce OpenID déjà utilisé (replay)");
  }

  const body = new URLSearchParams();
  for (const [key, value] of query.entries()) {
    if (!key.startsWith("openid.")) continue;
    if (key === "openid.mode") {
      body.set(key, "check_authentication");
    } else {
      body.set(key, value);
    }
  }

  const res = await fetch(STEAM_OPENID, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!text.includes("is_valid:true")) {
    throw new Error("Vérification Steam échouée");
  }

  return claimedId;
}

export type SteamProfile = {
  steamId: string;
  name: string;
  avatarUrl: string | null;
};

/** Public profile via community XML (no API key). */
export async function fetchSteamProfile(steamId: string): Promise<SteamProfile> {
  if (!isSteamId64(steamId)) {
    return { steamId, name: `Player ${steamId.slice(-4)}`, avatarUrl: null };
  }
  try {
    const res = await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`, {
      headers: { "User-Agent": "DemoReviewer/0.1" },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const name = xml.match(/<steamID><!\[CDATA\[(.*?)\]\]><\/steamID>/)?.[1]
      ?? xml.match(/<steamID>([^<]+)<\/steamID>/)?.[1]
      ?? `Player ${steamId.slice(-4)}`;
    const avatarUrl =
      xml.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/)?.[1]
      ?? xml.match(/<avatarFull>([^<]+)<\/avatarFull>/)?.[1]
      ?? null;
    return { steamId, name, avatarUrl };
  } catch {
    return { steamId, name: `Player ${steamId.slice(-4)}`, avatarUrl: null };
  }
}
