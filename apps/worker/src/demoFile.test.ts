import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it, vi } from "vitest";

// 1 MB cap so the zip-bomb case stays fast
vi.stubEnv("MAX_DECOMPRESSED_DEMO_MB", "1");
const { materializeDemoFile, withTempDir } = await import("./demoFile");

const DEMO = Buffer.concat([Buffer.from("PBDEMS2\0"), Buffer.alloc(64 * 1024, 7)]);

function write(dir: string, name: string, data: Buffer) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, data);
  return p;
}

describe("materializeDemoFile", () => {
  it("keeps raw .dem files as-is", () =>
    withTempDir(async (dir) => {
      const src = write(dir, "raw.bin", DEMO);
      expect(await materializeDemoFile(src, dir)).toBe(src);
    }));

  it.each([
    ["gzip", zlib.gzipSync],
    ["zstd", zlib.zstdCompressSync],
  ] as const)("decompresses %s", (_name, compress) =>
    withTempDir(async (dir) => {
      const out = await materializeDemoFile(write(dir, "in.bin", compress(DEMO)), dir);
      expect(fs.readFileSync(out).equals(DEMO)).toBe(true);
    }));

  it.each([
    ["gzip", zlib.gzipSync],
    ["zstd", zlib.zstdCompressSync],
  ] as const)("refuses a %s bomb over the size cap", (_name, compress) =>
    withTempDir(async (dir) => {
      const bomb = compress(Buffer.alloc(5 * 1024 * 1024));
      await expect(materializeDemoFile(write(dir, "bomb.bin", bomb), dir)).rejects.toThrow(
        /trop volumineuse/,
      );
    }));

  it("rejects unknown formats", () =>
    withTempDir(async (dir) => {
      const src = write(dir, "x.bin", Buffer.from("PK\x03\x04 not a demo"));
      await expect(materializeDemoFile(src, dir)).rejects.toThrow(/non reconnu/);
    }));
});
