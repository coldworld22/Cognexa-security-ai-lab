import { readFile, readdir } from "fs/promises";
import path from "path";

import { Pool } from "pg";

export async function runMigrations(pool: Pool): Promise<void> {
  const migrationsPath = path.resolve(__dirname, "migrations");
  const files = (await readdir(migrationsPath)).sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsPath, file), "utf-8");
    await pool.query(sql);
  }
}
