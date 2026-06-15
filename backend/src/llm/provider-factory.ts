import { BaseLLMProvider } from "./base-llm-provider";
import { GemmaProvider } from "./providers/gemma.provider";
import { LlamaProvider } from "./providers/llama.provider";
import { MistralProvider } from "./providers/mistral.provider";
import { QwenProvider } from "./providers/qwen.provider";

interface ProviderFactoryOptions {
  baseUrl: string;
  defaultModel: string;
}

export class ProviderFactory {
  private readonly providers: Record<string, BaseLLMProvider>;

  constructor(options: ProviderFactoryOptions) {
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

  listProviders() {
    return Object.entries(this.providers).map(([id, provider]) => ({
      id,
      models: provider.listModels()
    }));
  }
}
