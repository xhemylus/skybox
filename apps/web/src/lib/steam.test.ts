import { beforeEach, describe, expect, it, vi } from "vitest";

const claimOpenIdNonce = vi.fn();
vi.mock("./redis", () => ({ claimOpenIdNonce: (n: string) => claimOpenIdNonce(n) }));

const { extractSteamIdFromClaimedId, parseSteamId, verifySteamOpenId } = await import("./steam");
const { env } = await import("./env");

const STEAM_ID = "76561198000000001";
const CLAIMED = `https://steamcommunity.com/openid/id/${STEAM_ID}`;

function assertion(overrides: Record<string, string | null> = {}) {
  const returnTo = new URL("/api/auth/steam/callback", env.appUrl);
  returnTo.searchParams.set("next", "/dashboard");
  const base: Record<string, string> = {
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "id_res",
    "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    "openid.claimed_id": CLAIMED,
    "openid.identity": CLAIMED,
    "openid.return_to": returnTo.toString(),
    "openid.response_nonce": "2026-10-25T12:00:00Zabc",
    "openid.assoc_handle": "1234567890",
    "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "sig",
  };
  const q = new URLSearchParams(base);
  for (const [k, v] of Object.entries(overrides)) {
    if (v == null) q.delete(k);
    else q.set(k, v);
  }
  return q;
}

function steamSays(valid: boolean) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(`ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n`));
}

describe("parseSteamId", () => {
  it("accepts SteamID64 and profile URLs", () => {
    expect(parseSteamId(STEAM_ID)).toBe(STEAM_ID);
    expect(parseSteamId(` https://steamcommunity.com/profiles/${STEAM_ID}/ `)).toBe(STEAM_ID);
  });

  it("rejects anything else", () => {
    expect(parseSteamId("12345")).toBeNull();
    expect(parseSteamId("https://steamcommunity.com/id/vanity")).toBeNull();
    expect(parseSteamId("")).toBeNull();
  });

  it("only extracts ids from Steam's own claimed_id", () => {
    expect(extractSteamIdFromClaimedId(CLAIMED)).toBe(STEAM_ID);
    expect(extractSteamIdFromClaimedId(`https://evil.com/openid/id/${STEAM_ID}`)).toBeNull();
  });
});

describe("verifySteamOpenId", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    claimOpenIdNonce.mockReset().mockResolvedValue(true);
  });

  it("returns the SteamID for a valid assertion", async () => {
    const fetchSpy = steamSays(true);
    await expect(verifySteamOpenId(assertion())).resolves.toBe(STEAM_ID);

    // Re-posted to Steam as check_authentication
    const body = fetchSpy.mock.calls[0][1]!.body as URLSearchParams;
    expect(body.get("openid.mode")).toBe("check_authentication");
  });

  it("rejects when Steam does not confirm the signature", async () => {
    steamSays(false);
    await expect(verifySteamOpenId(assertion())).rejects.toThrow(/Vérification Steam/);
  });

  it("rejects replayed nonces without calling Steam", async () => {
    const fetchSpy = steamSays(true);
    claimOpenIdNonce.mockResolvedValue(false);
    await expect(verifySteamOpenId(assertion())).rejects.toThrow(/replay/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong mode", { "openid.mode": "cancel" }],
    ["foreign OP endpoint", { "openid.op_endpoint": "https://evil.com/openid/login" }],
    ["identity mismatch", { "openid.identity": "https://steamcommunity.com/openid/id/76561198000000002" }],
    ["non-Steam claimed_id", {
      "openid.claimed_id": `https://evil.com/openid/id/${STEAM_ID}`,
      "openid.identity": `https://evil.com/openid/id/${STEAM_ID}`,
    }],
    ["return_to on another origin", { "openid.return_to": "https://evil.com/api/auth/steam/callback" }],
    ["return_to with extra params", {
      "openid.return_to": new URL("/api/auth/steam/callback?x=1", env.appUrl).toString(),
    }],
    ["open redirect in next", {
      "openid.return_to": new URL("/api/auth/steam/callback?next=//evil.com", env.appUrl).toString(),
    }],
    ["missing nonce", { "openid.response_nonce": null }],
  ])("rejects %s", async (_label, overrides) => {
    const fetchSpy = steamSays(true);
    await expect(verifySteamOpenId(assertion(overrides))).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
