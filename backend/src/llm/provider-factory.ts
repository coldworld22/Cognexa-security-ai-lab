import { BaseLLMProvider } from "./base-llm-provider";
import { GemmaProvider } from "./providers/gemma.provider";
import { LlamaProvider } from "./providers/llama.provider";
import { MistralProvider } from "./providers/mistral.provider";
import { QwenProvider } from "./providers/qwen.provider";
import { z } from "zod";

interface ProviderFactoryOptions {
  baseUrl: string;
  defaultModel: string;
}

export class ProviderFactory {
  private readonly providers: Record<string, BaseLLMProvider>;
  private readonly baseUrl: string;

  constructor(options: ProviderFactoryOptions) {
    this.baseUrl = options.baseUrl;
    this.providers = {
      qwen: new QwenProvider(options.baseUrl, options.defaultModel),
      llama: new LlamaProvider(options.baseUrl, options.defaultModel),
      mistral: new MistralProvider(options.baseUrl, options.defaultModel),
      gemma: new GemmaProvider(options.baseUrl, options.defaultModel)
    };
  }

  getProvider(providerId: string): BaseLLMProvider {
    return this.providers[providerId] ?? this.providers.qwen!;
  }

  async listProviders() {
    const installedModels = await this.fetchInstalledModels();

    return Object.entries(this.providers).map(([id, provider]) => ({
      id,
      models: installedModels.filter((model) => this.matchesProvider(id, model))
    }));
  }

  private async fetchInstalledModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.resolveApiBaseUrl()}/api/tags`, {
        method: "GET"
      });

      if (!response.ok) {
        return [];
      }

      const payload = z
        .object({
          models: z
            .array(
              z.object({
                name: z.string(),
                capabilities: z.array(z.string()).optional()
              })
            )
            .default([])
        })
        .parse(await response.json());

      return payload.models
        .filter((model) => model.capabilities?.includes("completion"))
        .map((model) => model.name);
    } catch {
      return [];
    }
  }

  private resolveApiBaseUrl(): string {
    return this.baseUrl.replace(/\/v1\/?$/, "");
  }

  private matchesProvider(providerId: string, model: string): boolean {
    const normalizedModel = model.toLowerCase();

    switch (providerId) {
      case "qwen":
        return normalizedModel.startsWith("qwen");
      case "llama":
        return (
          normalizedModel.startsWith("llama") ||
          normalizedModel.startsWith("codellama")
        );
      case "mistral":
        return (
          normalizedModel.startsWith("mistral") ||
          normalizedModel.startsWith("codestral")
        );
      case "gemma":
        return (
          normalizedModel.startsWith("gemma") ||
          normalizedModel.startsWith("codegemma")
        );
      default:
        return false;
    }
  }
}
