import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class LlamaProvider extends OpenAICompatibleProvider {
  constructor(baseUrl: string, defaultModel: string) {
    super({
      providerId: "llama",
      baseUrl,
      defaultModel,
      catalog: ["llama3.1", "llama3.3", "codellama"]
    });
  }
}
