import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

/**
 * Client used only to sign URLs the *browser* will hit. Same credentials, but the
 * endpoint must be reachable from outside (e.g. R2, or a public MinIO URL).
 */
const publicS3 = env.s3.publicEndpoint
  ? new S3Client({
      region: env.s3.region,
      endpoint: env.s3.publicEndpoint,
      forcePathStyle: env.s3.forcePathStyle,
      credentials: {
        accessKeyId: env.s3.accessKeyId,
        secretAccessKey: env.s3.secretAccessKey,
      },
    })
  : s3;

let bucketReady: Promise<void> | null = null;

export async function ensureBucket() {
  if (!bucketReady) {
    bucketReady = (async () => {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: env.s3.bucket }));
      } catch {
        await s3.send(new CreateBucketCommand({ Bucket: env.s3.bucket }));
      }
      await ensureUploadCors();
    })().catch((err) => {
      bucketReady = null;
      throw err;
    });
  }
  await bucketReady;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  contentEncoding?: string,
) {
  await ensureBucket();
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: bytes,
      ContentLength: bytes.length,
      ContentType: contentType,
      ContentEncoding: contentEncoding,
    }),
  );
}

export async function deleteObject(key: string) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
    }),
  );
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
    }),
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Empty object: ${key}`);
  return Buffer.from(bytes);
}

export async function presignGet(key: string, expiresIn = 3600) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }),
    { expiresIn },
  );
}

/**
 * Browsers PUT demos straight to the bucket, so it needs CORS for APP_URL.
 * Best-effort: MinIO/Silo allow all origins and reject this call; R2 tokens without
 * bucket-admin rights also fail — then configure CORS in the dashboard (see deploy/PROD.md).
 */
async function ensureUploadCors() {
  try {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: env.s3.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: [new URL(env.appUrl).origin],
              AllowedMethods: ["PUT"],
              AllowedHeaders: ["content-type"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
  } catch (err) {
    console.warn(
      "[s3] could not set bucket CORS (fine on MinIO; on R2 set it manually):",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Presigned PUT the browser uploads to. Content-Length is signed, so the size is enforced. */
export async function presignPut(key: string, contentLength: number, expiresIn = 3600) {
  await ensureBucket();
  return getSignedUrl(
    publicS3,
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      ContentLength: contentLength,
      ContentType: "application/octet-stream",
    }),
    { expiresIn },
  );
}

/** Object size in bytes, or null if it doesn't exist. */
export async function headObjectSize(key: string): Promise<number | null> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: env.s3.bucket, Key: key }));
    return res.ContentLength ?? 0;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

/** First `length` bytes of an object (magic-number checks without downloading it). */
export async function getObjectHead(key: string, length: number): Promise<Buffer> {
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Range: `bytes=0-${length - 1}`,
    }),
  );
  const bytes = await res.Body?.transformToByteArray();
  return Buffer.from(bytes ?? []);
}
