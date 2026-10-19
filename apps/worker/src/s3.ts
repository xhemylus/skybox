import type { Readable } from "node:stream";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "./env";

export const s3 = new S3Client({
  region: env.s3.region,
  endpoint: env.s3.endpoint,
  forcePathStyle: env.s3.forcePathStyle,
  credentials: {
    accessKeyId: env.s3.accessKeyId,
    secretAccessKey: env.s3.secretAccessKey,
  },
});

let bucketReady: Promise<void> | null = null;

export async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: env.s3.bucket }));
      } catch {
        await s3.send(new CreateBucketCommand({ Bucket: env.s3.bucket }));
      }
    })().catch((err) => {
      bucketReady = null;
      throw err;
    });
  }
  await bucketReady;
}

export async function downloadToBuffer(key: string): Promise<Buffer> {
  await ensureBucket();
  const res = await s3.send(
    new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }),
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Empty object ${key}`);
  return Buffer.from(bytes);
}

export async function uploadObject(
  key: string,
  body: Buffer | Readable,
  opts: { contentType: string; contentEncoding?: string },
) {
  await ensureBucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: body,
      ContentType: opts.contentType,
      ContentEncoding: opts.contentEncoding,
    }),
  );
}
