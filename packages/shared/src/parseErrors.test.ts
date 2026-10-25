import { describe, expect, it } from "vitest";
import { humanizeParseError } from "./parseErrors";

describe("humanizeParseError", () => {
  it.each([
    ['Not a CS2 demo (magic="PK")', /pas une démo CS2/],
    ["No rounds found in demo", /Aucun round/],
    ["ENOSPC: no space left on device", /Espace disque/],
    ["connect ECONNREFUSED 127.0.0.1:6379", /temporairement indisponible/],
    ["SignatureDoesNotMatch", /Accès stockage refusé/],
  ])("translates %s", (raw, expected) => {
    expect(humanizeParseError(raw)).toMatch(expected);
  });

  it("keeps worker messages that are already user-facing", () => {
    const msg = "Doublon : cette démo est déjà importée (« a.dem »). Supprime ce match.";
    expect(humanizeParseError(msg)).toBe(msg);
  });

  it("handles empty and huge messages", () => {
    expect(humanizeParseError("")).toMatch(/inconnue/);
    expect(humanizeParseError("x".repeat(500)).length).toBeLessThanOrEqual(141);
  });
});
