import { mkdir } from "fs/promises";

import { Pool } from "pg";
import { Logger } from "pino";
import { RedisClientType } from "redis";

import { env } from "../config/env";
import { runMigrations } from "../database/migration-runner";
import { resolveBackendPath } from "../utils/paths";
import { retry } from "../utils/retry";

export async function initializeRuntime(
  postgres: Pool,
  redis: RedisClientType,
  logger: Logger
): Promise<void> {
  await ensureRuntimeDirectories(logger);
  await ensurePostgresReady(postgres, logger);
  await runMigrations(postgres, logger);
  await ensureRedisReady(redis, logger);
}

async function ensureRuntimeDirectories(logger: Logger): Promise<void> {
  const directories = [
    resolveBackendPath(env.UPLOADS_PATH),
    resolveBackendPath(env.STORAGE_PATH)
  ];

  await Promise.all(
    directories.map(async (directory) => {
      await mkdir(directory, { recursive: true });
      logger.debug({ directory }, "Ensured runtime directory exists");
    })
  );
}

async function ensurePostgresReady(postgres: Pool, logger: Logger): Promise<void> {
  await retry(
    async () => {
      await postgres.query("SELECT 1");
    },
    {
      attempts: env.STARTUP_RETRY_ATTEMPTS,
      delayMs: env.STARTUP_RETRY_DELAY_MS,
      onRetry: (error, attempt) => {
        logger.warn(
          {
            attempt,
            error
          },
          "PostgreSQL not ready yet; retrying startup check"
        );
      }
    }
  );
}

async function ensureRedisReady(
  redis: RedisClientType,
  logger: Logger
): Promise<void> {
  await retry(
    async () => {
      if (!redis.isOpen) {
        await redis.connect();
      }

      const result = await redis.ping();
      if (result !== "PONG") {
        throw new Error("Unexpected Redis ping response");
      }
    },
    {
      attempts: env.STARTUP_RETRY_ATTEMPTS,
      delayMs: env.STARTUP_RETRY_DELAY_MS,
      onRetry: (error, attempt) => {
        logger.warn(
          {
            attempt,
            error
          },
          "Redis not ready yet; retrying startup check"
        );
      }
    }
  );
}
