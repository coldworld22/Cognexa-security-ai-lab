import { z } from "zod";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ToolCallDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMCompletionRequest {
  model: string;
  messages: LLMMessage[];
  tools?: ToolCallDefinition[];
}

export interface LLMCompletionResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface LLMStreamChunk {
  delta: string;
  done?: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export abstract class BaseLLMProvider {
  abstract readonly providerId: string;

  abstract listModels(): string[];

  abstract generate(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;

  abstract stream(request: LLMCompletionRequest): AsyncGenerator<LLMStreamChunk>;

  async generateStructured<TSchema extends z.ZodTypeAny>(
    request: LLMCompletionRequest,
    schema: TSchema
  ): Promise<z.infer<TSchema>> {
    const response = await this.generate(request);
    return schema.parse(JSON.parse(response.content));
  }
}
