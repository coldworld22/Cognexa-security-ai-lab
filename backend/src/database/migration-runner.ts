import { readFile, readdir } from "fs/promises";
import path from "path";

import { Pool } from "pg";
import { Logger } from "pino";

import { resolveBackendPath } from "../utils/paths";

export async function runMigrations(pool: Pool, logger: Logger): Promise<void> {
  const migrationsPath = resolveBackendPath("src/database/migrations");
  const files = (await readdir(migrationsPath)).sort();
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query<{
      filename: string;
    }>("SELECT filename FROM schema_migrations");
    const applied = new Set(appliedResult.rows.map((row) => row.filename));
    let appliedCount = 0;

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = await readFile(path.join(migrationsPath, file), "utf-8");
      await client.query("BEGIN");

      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        appliedCount += 1;
        logger.info({ migration: file }, "Applied database migration");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    logger.info(
      { totalMigrations: files.length, appliedThisRun: appliedCount },
      "Database migrations complete"
    );
  } finally {
    client.release();
  }
}
