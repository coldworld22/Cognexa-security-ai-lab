import test from "node:test";
import assert from "node:assert/strict";

import { Pool } from "pg";
import { RedisClientType } from "redis";

import { ProviderFactory } from "../src/llm/provider-factory";
import { HealthService } from "../src/services/health/health.service";

function createHealthService(options: {
  fetchOk?: boolean;
  providers: Array<{
    id: string;
    models: string[];
  }>;
}) {
  const postgres = {
    query: async () => ({ rowCount: 1 })
  } as unknown as Pool;

  const redis = {
    ping: async () => "PONG"
  } as unknown as RedisClientType;

  const providerFactory = {
    listProviders: async () => options.providers
  } as unknown as ProviderFactory;

  const service = new HealthService(
    postgres,
    redis,
    providerFactory,
    "http://localhost:11434/v1"
  );

  const originalFetch = global.fetch;
  global.fetch = (async () =>
    ({
      ok: options.fetchOk ?? true
    }) as Response) as typeof fetch;

  return {
    service,
    restore() {
      global.fetch = originalFetch;
    }
  };
}

test("HealthService reports degraded status when no usable local models are installed", async () => {
  const { service, restore } = createHealthService({
    providers: [
      { id: "qwen", models: [] },
      { id: "llama", models: [] }
    ]
  });

  try {
    const snapshot = await service.getSnapshot();

    assert.equal(snapshot.status, "degraded");
    assert.equal(snapshot.dependencies.localModel.status, "degraded");
  } finally {
    restore();
  }
});

test("HealthService reports ok status when the local runtime is reachable and models are installed", async () => {
  const { service, restore } = createHealthService({
    providers: [
      { id: "qwen", models: ["qwen2.5-coder:1.5b"] }
    ]
  });

  try {
    const snapshot = await service.getSnapshot();

    assert.equal(snapshot.status, "ok");
    assert.equal(snapshot.dependencies.localModel.status, "up");
  } finally {
    restore();
  }
});
