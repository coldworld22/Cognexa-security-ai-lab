import test from "node:test";
import assert from "node:assert/strict";

import { ProviderFactory } from "../src/llm/provider-factory";

test("ProviderFactory normalizes :latest model tags when listing providers", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        models: [
          {
            name: "qwen2.5-coder:latest",
            model: "qwen2.5-coder:latest",
            capabilities: ["completion", "tools"]
          }
        ]
      })
    }) as Response) as typeof fetch;

  try {
    const factory = new ProviderFactory({
      baseUrl: "http://localhost:11434/v1",
      defaultModel: "qwen2.5-coder"
    });

    const providers = await factory.listProviders();
    const qwen = providers.find((provider) => provider.id === "qwen");

    assert.deepEqual(qwen?.models, ["qwen2.5-coder"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("ProviderFactory accepts models from Ollama tag payloads without capabilities metadata", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    ({
      ok: true,
      json: async () => ({
        models: [
          {
            name: "llama3.1"
          }
        ]
      })
    }) as Response) as typeof fetch;

  try {
    const factory = new ProviderFactory({
      baseUrl: "http://localhost:11434/v1",
      defaultModel: "qwen2.5-coder"
    });

    const providers = await factory.listProviders();
    const llama = providers.find((provider) => provider.id === "llama");

    assert.deepEqual(llama?.models, ["llama3.1"]);
  } finally {
    global.fetch = originalFetch;
  }
});
