import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { ensureBucket, s3 } from "./s3";
import { env } from "./env";

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** Cap on decompressed size — a small .gz/.zst can expand to fill the disk. */
const MAX_DECOMPRESSED_BYTES =
  Number(process.env.MAX_DECOMPRESSED_DEMO_MB ?? "2048") * 1024 * 1024;

function decompressedSizeLimit(): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      if (total > MAX_DECOMPRESSED_BYTES) {
        cb(new Error("Démo décompressée trop volumineuse (fichier corrompu ou malveillant)."));
        return;
      }
      cb(null, chunk);
    },
  });
}

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "demoreviewer-"));
  try {
    return await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function asNodeReadable(body: unknown): Readable {
  if (body instanceof Readable) return body;
  const withWeb = body as { transformToWebStream?: () => ReadableStream };
  if (typeof withWeb?.transformToWebStream === "function") {
    return Readable.fromWeb(withWeb.transformToWebStream() as never);
  }
  throw new Error("Unsupported S3 body stream");
}

/** Download object to disk (no giant Buffer in JS). Returns the SHA-256 of the bytes. */
export async function downloadToFile(key: string, dest: string): Promise<string> {
  await ensureBucket();
  const res = await s3.send(
    new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }),
  );
  if (!res.Body) throw new Error(`Empty object ${key}`);
  const hash = createHash("sha256");
  await pipeline(
    asNodeReadable(res.Body),
    new Transform({
      transform(chunk: Buffer, _enc, cb) {
        hash.update(chunk);
        cb(null, chunk);
      },
    }),
    fs.createWriteStream(dest),
  );
  return hash.digest("hex");
}

/**
 * Ensure we have a raw CS2 .dem on disk. Streams gzip/zstd → file so peak RAM
 * stays far below "download buffer + decompressed buffer".
 */
export async function materializeDemoFile(srcPath: string, dir: string): Promise<string> {
  const fd = await fsp.open(srcPath, "r");
  const head = Buffer.alloc(8);
  try {
    await fd.read(head, 0, 8, 0);
  } finally {
    await fd.close();
  }

  if (head.toString("latin1").startsWith("PBDEMS2")) {
    return srcPath;
  }

  const out = path.join(dir, "demo.dem");
  if (head[0] === 0x1f && head[1] === 0x8b) {
    await pipeline(
      fs.createReadStream(srcPath),
      zlib.createGunzip(),
      decompressedSizeLimit(),
      fs.createWriteStream(out),
    );
    await fsp.unlink(srcPath).catch(() => undefined);
    return out;
  }

  if (head.subarray(0, 4).equals(ZSTD_MAGIC)) {
    const createZstd = (
      zlib as unknown as { createZstdDecompress?: () => NodeJS.ReadWriteStream }
    ).createZstdDecompress;
    if (!createZstd) {
      const raw = await fsp.readFile(srcPath);
      await fsp.writeFile(
        out,
        zlib.zstdDecompressSync(raw, { maxOutputLength: MAX_DECOMPRESSED_BYTES }),
      );
      await fsp.unlink(srcPath).catch(() => undefined);
      return out;
    }
    await pipeline(
      fs.createReadStream(srcPath),
      createZstd(),
      decompressedSizeLimit(),
      fs.createWriteStream(out),
    );
    await fsp.unlink(srcPath).catch(() => undefined);
    return out;
  }

  throw new Error(`Format de démo non reconnu (magic=${JSON.stringify(head.toString("latin1"))})`);
}
