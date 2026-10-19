import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const url =
    process.env.DATABASE_URL ?? "postgresql://skybox:skybox@localhost:5432/skybox";
  const client = postgres(url, { max: 1 });
  const migrationsFolder = path.join(__dirname, "../../drizzle");

  await client`
    CREATE TABLE IF NOT EXISTS "__skybox_migrations" (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const files = fs
    .readdirSync(migrationsFolder)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const [applied] = await client`
      SELECT id FROM "__skybox_migrations" WHERE id = ${file}
    `;
    if (applied) {
      console.log("skip", file);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsFolder, file), "utf8");
    console.log("apply", file);
    await client.begin(async (tx) => {
      await tx.unsafe(sql);
      await tx`INSERT INTO "__skybox_migrations" (id) VALUES (${file})`;
    });
  }

  await client.end();
  console.log("Migrations complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
