export const env = {
  databaseUrl:
    process.env.DATABASE_URL ?? "postgresql://skybox:skybox@localhost:5432/skybox",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "skybox",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "skyboxsecret",
    bucket: process.env.S3_BUCKET ?? "skybox-demos",
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  },
};
