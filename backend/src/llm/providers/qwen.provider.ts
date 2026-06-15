import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class QwenProvider extends OpenAICompatibleProvider {
  constructor(baseUrl: string, defaultModel: string) {
    super({
      providerId: "qwen",
      baseUrl,
      defaultModel,
      catalog: ["qwen2.5-coder", "qwen2.5-instruct", "qwen3"]
    });
  }
}
