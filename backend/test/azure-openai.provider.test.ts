import test from "node:test";
import assert from "node:assert/strict";

import { ProviderFactory } from "../src/llm/provider-factory";
import { AzureOpenAIProvider, azureOpenAIBaseUrl } from "../src/llm/providers/azure-openai.provider";
import { OpenAICompatibleEmbeddingProvider } from "../src/rag/embedding/openai-compatible-embedding-provider";

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function captureFetch(responseBody: unknown): { calls: CapturedRequest[]; restore: () => void } {
  const originalFetch = global.fetch;
  const calls: CapturedRequest[] = [];
  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body ?? "{}"))
    });
    return { ok: true, status: 200, json: async () => responseBody } as Response;
  }) as typeof fetch;
  return { calls, restore: () => (global.fetch = originalFetch) };
}

test("azureOpenAIBaseUrl targets the v1 API and tolerates a trailing slash", () => {
  assert.equal(
    azureOpenAIBaseUrl("https://cognexa.openai.azure.com/"),
    "https://cognexa.openai.azure.com/openai/v1"
  );
});

test("AzureOpenAIProvider sends the api-key header and uses the deployment as the model", async () => {
  const { calls, restore } = captureFetch({
    choices: [{ message: { content: "hello from azure" } }],
    usage: { prompt_tokens: 7, completion_tokens: 3 }
  });

  try {
    const provider = new AzureOpenAIProvider({
      endpoint: "https://cognexa.openai.azure.com",
      apiKey: "test-key",
      deployments: ["gpt-4o-mini", "gpt-4o"]
    });

    const result = await provider.generate({
      model: "",
      messages: [{ role: "user", content: "hi" }]
    });

    assert.equal(result.content, "hello from azure");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "https://cognexa.openai.azure.com/openai/v1/chat/completions");
    assert.equal(calls[0]!.headers["api-key"], "test-key");
    assert.equal(calls[0]!.body.model, "gpt-4o-mini");
    assert.deepEqual(provider.listModels(), ["gpt-4o-mini", "gpt-4o"]);
  } finally {
    restore();
  }
});

test("AzureOpenAIProvider refuses an empty deployment list", () => {
  assert.throws(
    () => new AzureOpenAIProvider({ endpoint: "https://x.openai.azure.com", apiKey: "k", deployments: [] }),
    /at least one chat deployment/
  );
});

test("ProviderFactory lists Azure deployments without asking the local model server", async () => {
  const { calls, restore } = captureFetch({ models: [] });

  try {
    const factory = new ProviderFactory({
      baseUrl: "http://localhost:11434/v1",
      defaultModel: "qwen2.5-coder",
      defaultProvider: "azure-openai",
      azureOpenAI: {
        endpoint: "https://cognexa.openai.azure.com",
        apiKey: "test-key",
        deployments: ["gpt-4o-mini"]
      }
    });

    const providers = await factory.listProviders();
    const azure = providers.find((provider) => provider.id === "azure-openai");

    assert.deepEqual(azure?.models, ["gpt-4o-mini"]);
    assert.ok(calls.every((call) => !call.url.includes("openai.azure.com")));
    assert.equal(factory.getProvider("unknown").providerId, "azure-openai");
  } finally {
    restore();
  }
});

test("ProviderFactory keeps qwen as the fallback when Azure is not configured", () => {
  const factory = new ProviderFactory({
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5-coder",
    defaultProvider: "azure-openai"
  });

  assert.equal(factory.getProvider("unknown").providerId, "qwen");
});

test("Embedding provider sends api-key and requests the configured vector size", async () => {
  const { calls, restore } = captureFetch({
    data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
    model: "text-embedding-3-small"
  });

  try {
    const provider = new OpenAICompatibleEmbeddingProvider({
      baseUrl: azureOpenAIBaseUrl("https://cognexa.openai.azure.com"),
      providerId: "azure-openai",
      defaultModel: "text-embedding-3-small",
      headers: { "api-key": "test-key" },
      dimensions: 768
    });

    const [vector] = await provider.embed(["hello"]);

    assert.equal(calls[0]!.url, "https://cognexa.openai.azure.com/openai/v1/embeddings");
    assert.equal(calls[0]!.headers["api-key"], "test-key");
    assert.equal(calls[0]!.body.dimensions, 768);
    assert.equal(vector?.provider, "azure-openai");
  } finally {
    restore();
  }
});
