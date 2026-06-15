import { z } from "zod";

import {
  BaseLLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk
} from "../base-llm-provider";

interface OpenAICompatibleProviderOptions {
  providerId: string;
  baseUrl: string;
  defaultModel: string;
  catalog: string[];
}

export class OpenAICompatibleProvider extends BaseLLMProvider {
  readonly providerId: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly catalog: string[];

  constructor(options: OpenAICompatibleProviderOptions) {
    super();
    this.providerId = options.providerId;
    this.baseUrl = options.baseUrl;
    this.defaultModel = options.defaultModel;
    this.catalog = options.catalog;
  }

  listModels() {
    return this.catalog;
  }

  async generate(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const payload = this.buildPayload(request);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Provider returned ${response.status}`);
      }

      const json = z
        .object({
          choices: z.array(
            z.object({
              message: z.object({
                content: z.string().default("")
              })
            })
          ),
          usage: z
            .object({
              prompt_tokens: z.number().optional(),
              completion_tokens: z.number().optional()
            })
            .optional()
        })
        .parse(await response.json());

      return {
        content: json.choices[0]?.message.content ?? "",
        usage: {
          inputTokens: json.usage?.prompt_tokens ?? 0,
          outputTokens: json.usage?.completion_tokens ?? 0
        }
      };
    } catch {
      const content = `Stubbed ${this.providerId} response for model ${payload.model}. Wire a local OpenAI-compatible endpoint to ${this.baseUrl} to enable live inference.`;
      return {
        content,
        usage: {
          inputTokens: request.messages.length * 16,
          outputTokens: Math.ceil(content.length / 4)
        }
      };
    }
  }

  async *stream(request: LLMCompletionRequest): AsyncGenerator<LLMStreamChunk> {
    const payload = {
      ...this.buildPayload(request),
      stream: true
    };

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok || !response.body) {
        throw new Error(`Provider returned ${response.status}`);
      }

      const decoder = new TextDecoder();
      let buffer = "";

      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const eventBlock of events) {
          const dataLines = eventBlock
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6).trim());

          for (const data of dataLines) {
            if (data === "[DONE]") {
              yield {
                delta: "",
                done: true
              };
              return;
            }

            const parsed = z
              .object({
                choices: z
                  .array(
                    z.object({
                      delta: z
                        .object({
                          content: z.union([
                            z.string(),
                            z.array(
                              z.object({
                                type: z.string().optional(),
                                text: z.string().optional()
                              })
                            )
                          ])
                          .optional()
                        }),
                      finish_reason: z.string().nullable().optional()
                    })
                  )
                  .optional(),
                usage: z
                  .object({
                    prompt_tokens: z.number().optional(),
                    completion_tokens: z.number().optional()
                  })
                  .optional()
              })
              .safeParse(JSON.parse(data));

            if (!parsed.success) {
              continue;
            }

            const delta = parsed.data.choices?.[0]?.delta.content;
            const text =
              typeof delta === "string"
                ? delta
                : (delta ?? [])
                    .map((part) => part.text ?? "")
                    .join("");

            if (text) {
              yield {
                delta: text,
                usage: {
                  inputTokens: parsed.data.usage?.prompt_tokens,
                  outputTokens: parsed.data.usage?.completion_tokens
                }
              };
            }

            if (parsed.data.choices?.[0]?.finish_reason) {
              yield {
                delta: "",
                done: true
              };
              return;
            }
          }
        }
      }
    } catch {
      const response = await this.generate(request);
      const segments = response.content.split(" ");

      for (const segment of segments) {
        yield {
          delta: `${segment} `
        };
      }

      yield {
        delta: "",
        done: true
      };
    }
  }

  private buildPayload(request: LLMCompletionRequest) {
    return {
      model: request.model || this.defaultModel,
      messages: request.messages
    };
  }
}
