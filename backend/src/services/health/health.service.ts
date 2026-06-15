import { Pool } from "pg";
import { RedisClientType } from "redis";

import { ProviderFactory } from "../../llm/provider-factory";

export class HealthService {
  constructor(
    private readonly postgres: Pool,
    private readonly redis: RedisClientType,
    private readonly providers: ProviderFactory
  ) {}

  async getSnapshot() {
    const [postgresResult, redisResult] = await Promise.all([
      this.postgres.query("SELECT 1"),
      this.redis.ping()
    ]);

    return {
      status: "ok",
      dependencies: {
        postgres: postgresResult.rowCount === 1 ? "up" : "degraded",
        redis: redisResult === "PONG" ? "up" : "degraded",
        llmProviders: this.providers.listProviders()
      }
    };
  }
}
