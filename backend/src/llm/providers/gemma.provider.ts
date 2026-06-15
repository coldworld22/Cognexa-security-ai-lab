import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class GemmaProvider extends OpenAICompatibleProvider {
  constructor(baseUrl: string, defaultModel: string) {
    super({
      providerId: "gemma",
      baseUrl,
      defaultModel,
      catalog: ["gemma2", "codegemma"]
    });
  }
}
