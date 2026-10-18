import "dotenv/config";
import pg from "pg";
import { readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(78124002)");
  await client.query(
    await readFile(new URL("./schema.sql", import.meta.url), "utf8"),
  );
  await client.query("COMMIT");
  console.log(
    "thumbnail_editor schema ready. Existing highlight tables unchanged.",
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
