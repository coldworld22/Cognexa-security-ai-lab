import { Pool } from "pg";
import { RedisClientType } from "redis";

import { ProviderFactory } from "../../llm/provider-factory";

export class HealthService {
  constructor(
    private readonly postgres: Pool,
    private readonly redis: RedisClientType,
    private readonly providers: ProviderFactory,
    private readonly llmBaseUrl: string
  ) {}

  async getSnapshot() {
    let postgresStatus: "up" | "degraded" = "up";
    let redisStatus: "up" | "degraded" = "up";
    const localModel = await this.probeLocalModel();
    const llmProviders = await this.providers.listProviders();

    try {
      const postgresResult = await this.postgres.query("SELECT 1");
      postgresStatus = postgresResult.rowCount === 1 ? "up" : "degraded";
    } catch {
      postgresStatus = "degraded";
    }

    try {
      const redisResult = await this.redis.ping();
      redisStatus = redisResult === "PONG" ? "up" : "degraded";
    } catch {
      redisStatus = "degraded";
    }

    const status =
      postgresStatus === "up" &&
      redisStatus === "up" &&
      localModel.status === "up"
        ? "ok"
        : "degraded";

    return {
      status,
      checkedAt: new Date().toISOString(),
      dependencies: {
        postgres: postgresStatus,
        redis: redisStatus,
        llmProviders,
        localModel
      }
    };
  }

  private async probeLocalModel(): Promise<{
    status: "up" | "degraded";
    endpoint: string;
    latencyMs?: number;
  }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const startedAt = Date.now();

    try {
      const response = await fetch(`${this.llmBaseUrl}/models`, {
        method: "GET",
        signal: controller.signal
      });

      const latencyMs = Date.now() - startedAt;

      return {
        status: response.ok ? "up" : "degraded",
        endpoint: this.llmBaseUrl,
        latencyMs
      };
    } catch {
      return {
        status: "degraded",
        endpoint: this.llmBaseUrl
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
