import { z } from "zod";

import {
  BaseLLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk
} from "../base-llm-provider";
import { AppError } from "../../utils/app-error";

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
        const body = await response.text();
        if (response.status === 404) {
          throw new AppError(
            `Model '${payload.model}' is not installed for provider '${this.providerId}'. Pull it locally or choose an installed model.`,
            404,
            {
              provider: this.providerId,
              model: payload.model,
              endpoint: this.baseUrl,
              body
            }
          );
        }

        throw new AppError(
          `LLM provider '${this.providerId}' returned ${response.status}.`,
          502,
          {
            provider: this.providerId,
            model: payload.model,
            endpoint: this.baseUrl,
            body
          }
        );
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
    } catch (error) {
      throw this.normalizeProviderError(error, payload.model);
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
        const body = response.body ? undefined : await response.text();
        if (response.status === 404) {
          throw new AppError(
            `Model '${payload.model}' is not installed for provider '${this.providerId}'. Pull it locally or choose an installed model.`,
            404,
            {
              provider: this.providerId,
              model: payload.model,
              endpoint: this.baseUrl,
              body
            }
          );
        }

        throw new AppError(
          `LLM provider '${this.providerId}' returned ${response.status} while streaming.`,
          502,
          {
            provider: this.providerId,
            model: payload.model,
            endpoint: this.baseUrl,
            body
          }
        );
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
    } catch (error) {
      throw this.normalizeProviderError(error, payload.model);
    }
  }

  private buildPayload(request: LLMCompletionRequest) {
    return {
      model: request.model || this.defaultModel,
      messages: request.messages
    };
  }

  private normalizeProviderError(error: unknown, model: string): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return new AppError(
        `LLM provider '${this.providerId}' is unreachable at ${this.baseUrl}.`,
        502,
        {
          provider: this.providerId,
          model,
          endpoint: this.baseUrl,
          reason: error.message
        }
      );
    }

    return new AppError(
      `LLM provider '${this.providerId}' is unavailable.`,
      502,
      {
        provider: this.providerId,
        model,
        endpoint: this.baseUrl
      }
    );
  }
}
