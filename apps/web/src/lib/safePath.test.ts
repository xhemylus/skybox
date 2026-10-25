import { describe, expect, it } from "vitest";
import { isSafeRelativePath, safeRedirectPath } from "./safePath";

describe("isSafeRelativePath", () => {
  it.each(["/dashboard", "/m/abc?round=3", "/r/x2y3/mirage"])("accepts %s", (p) => {
    expect(isSafeRelativePath(p)).toBe(true);
  });

  it.each([
    ["protocol-relative", "//evil.com"],
    ["absolute URL", "https://evil.com"],
    ["no leading slash", "evil.com"],
    ["backslash trick", "/\\evil.com"],
    ["embedded scheme", "/redirect?u=https://evil.com"],
    ["header injection", "/ok\r\nSet-Cookie: x=1"],
    ["empty", ""],
    ["too long", "/" + "a".repeat(600)],
  ])("rejects %s", (_label, p) => {
    expect(isSafeRelativePath(p)).toBe(false);
  });

  it("falls back for unsafe redirects", () => {
    expect(safeRedirectPath("//evil.com")).toBe("/dashboard");
    expect(safeRedirectPath(null, "/team")).toBe("/team");
    expect(safeRedirectPath("/stats")).toBe("/stats");
  });
});
