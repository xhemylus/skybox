import { describe, expect, it } from "vitest";
import { MIN_DEMO_BYTES } from "@skybox/shared";
import { HttpError } from "./api";
import { assertValidDemo, demoKeyFor } from "./demoUpload";
import { env } from "./env";

const TEAM = "11111111-1111-1111-1111-111111111111";
const MATCH = "22222222-2222-2222-2222-222222222222";

describe("assertValidDemo", () => {
  it("accepts supported formats", () => {
    for (const name of ["a.dem", "a.dem.zst", "A.DEM.GZ"]) {
      expect(() => assertValidDemo(name, MIN_DEMO_BYTES)).not.toThrow();
    }
  });

  it("rejects other extensions, tiny and oversized files", () => {
    expect(() => assertValidDemo("a.exe", MIN_DEMO_BYTES)).toThrow(HttpError);
    expect(() => assertValidDemo("a.dem", MIN_DEMO_BYTES - 1)).toThrow(/trop petit/);
    expect(() => assertValidDemo("a.dem", env.maxDemoSizeMb * 1024 * 1024 + 1)).toThrow(
      /trop volumineux/,
    );
  });
});

describe("demoKeyFor", () => {
  it("scopes keys to team and match", () => {
    expect(demoKeyFor(TEAM, MATCH, "faze-vs-navi.dem")).toBe(
      `demos/${TEAM}/${MATCH}/faze-vs-navi.dem`,
    );
  });

  it("neutralises path traversal and odd characters", () => {
    const key = demoKeyFor(TEAM, MATCH, "../../other-team/x y.dem");
    expect(key.startsWith(`demos/${TEAM}/${MATCH}/`)).toBe(true);
    const segments = key.split("/");
    expect(segments).toHaveLength(4);
    expect(segments[3]).not.toMatch(/^\.+$/);
    expect(demoKeyFor(TEAM, MATCH, "...")).toBe(`demos/${TEAM}/${MATCH}/demo.dem`);
  });
});
