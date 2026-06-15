import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class MistralProvider extends OpenAICompatibleProvider {
  constructor(baseUrl: string, defaultModel: string) {
    super({
      providerId: "mistral",
      baseUrl,
      defaultModel,
      catalog: ["mistral-small", "mistral-medium", "codestral"]
    });
  }
}
