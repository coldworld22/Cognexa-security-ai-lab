import { BaseLLMProvider } from "./base-llm-provider";
import { GemmaProvider } from "./providers/gemma.provider";
import { LlamaProvider } from "./providers/llama.provider";
import { MistralProvider } from "./providers/mistral.provider";
import { QwenProvider } from "./providers/qwen.provider";
import { AzureOpenAIOptions, AzureOpenAIProvider } from "./providers/azure-openai.provider";
import { z } from "zod";

interface ProviderFactoryOptions {
  baseUrl: string;
  defaultModel: string;
  /** Provider used when a request names none or an unknown one. Defaults to qwen. */
  defaultProvider?: string;
  /** Registers the hosted Azure OpenAI provider next to the local ones. */
  azureOpenAI?: AzureOpenAIOptions;
}

/** Providers whose models come from their own configuration rather than the local Ollama server. */
const HOSTED_PROVIDERS = new Set(["azure-openai"]);

export class ProviderFactory {
  private readonly providers: Record<string, BaseLLMProvider>;
  private readonly baseUrl: string;
  private readonly defaultProvider: string;

  constructor(options: ProviderFactoryOptions) {
    this.baseUrl = options.baseUrl;
    this.providers = {
      qwen: new QwenProvider(options.baseUrl, options.defaultModel),
      llama: new LlamaProvider(options.baseUrl, options.defaultModel),
      mistral: new MistralProvider(options.baseUrl, options.defaultModel),
      gemma: new GemmaProvider(options.baseUrl, options.defaultModel)
    };

    if (options.azureOpenAI) {
      this.providers["azure-openai"] = new AzureOpenAIProvider(options.azureOpenAI);
    }

    this.defaultProvider =
      options.defaultProvider && this.providers[options.defaultProvider]
        ? options.defaultProvider
        : "qwen";
  }

  getProvider(providerId: string): BaseLLMProvider {
    return this.providers[providerId] ?? this.providers[this.defaultProvider]!;
  }

  async listProviders() {
    const installedModels = await this.fetchInstalledModels();

    return Object.entries(this.providers).map(([id, provider]) => ({
      id,
      models: HOSTED_PROVIDERS.has(id)
        ? provider.listModels()
        : installedModels.filter((model) => this.matchesProvider(id, model))
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
                name: z.string().optional(),
                model: z.string().optional(),
                capabilities: z.array(z.string()).optional()
              })
            )
            .default([])
        })
        .parse(await response.json());

      const installedModels = payload.models
        .filter((model) => this.isCompletionModel(model.capabilities))
        .map((model) => this.normalizeModelName(model.model ?? model.name ?? ""))
        .filter((model) => model.length > 0);

      return Array.from(new Set(installedModels));
    } catch {
      return [];
    }
  }

  private resolveApiBaseUrl(): string {
    return this.baseUrl.replace(/\/v1\/?$/, "");
  }

  private matchesProvider(providerId: string, model: string): boolean {
    const normalizedModel = this.normalizeModelName(model).toLowerCase();

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

  private normalizeModelName(model: string): string {
    return model.trim().replace(/:latest$/i, "");
  }

  private isCompletionModel(capabilities?: string[]): boolean {
    if (!capabilities || capabilities.length === 0) {
      return true;
    }

    return capabilities.some((capability) =>
      ["completion", "tools", "insert", "vision"].includes(capability)
    );
  }
}
