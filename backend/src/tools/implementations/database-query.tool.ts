import { Pool } from "pg";

import { BaseTool } from "../base-tool";

interface DatabaseQueryInput {
  sql: string;
}

export class DatabaseQueryTool extends BaseTool<
  DatabaseQueryInput,
  { rows: Array<Record<string, unknown>> }
> {
  readonly metadata = {
    name: "database-query",
    description: "Run read-only SQL queries against PostgreSQL.",
    category: "database" as const,
    inputSchema: {
      sql: "string"
    }
  };

  constructor(private readonly pool: Pool) {
    super();
  }

  async execute(input: DatabaseQueryInput) {
    const normalized = input.sql.trim().toLowerCase();
    if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
      throw new Error("Only read-only SELECT queries are allowed");
    }

    const result = await this.pool.query(input.sql);
    return {
      rows: result.rows
    };
  }
}
