import { z } from "zod";

import {
  LLMCompletionRequest,
  LLMMessage,
  ToolCallDefinition
} from "../../llm/base-llm-provider";
import { ProviderFactory } from "../../llm/provider-factory";
import { ToolExecutionService } from "../tool-execution/tool-execution.service";

interface ChatReplyInput {
  provider: string;
  model: string;
  messages: LLMMessage[];
  tools?: ToolCallDefinition[];
}

export class LLMService {
  constructor(
    private readonly providerFactory: ProviderFactory,
    private readonly tools: ToolExecutionService
  ) {}

  async createReply(input: ChatReplyInput) {
    const provider = this.providerFactory.getProvider(input.provider);
    return provider.generate({
      model: input.model,
      messages: input.messages,
      tools: input.tools
    });
  }

  async *streamReply(input: ChatReplyInput) {
    const provider = this.providerFactory.getProvider(input.provider);
    yield* provider.stream({
      model: input.model,
      messages: input.messages,
      tools: input.tools
    });
  }

  async createStructuredOutput<TSchema extends z.ZodTypeAny>(
    providerId: string,
    request: LLMCompletionRequest,
    schema: TSchema
  ): Promise<z.infer<TSchema>> {
    const provider = this.providerFactory.getProvider(providerId);
    return provider.generateStructured(request, schema);
  }

  async callTool(toolName: string, input: Record<string, unknown>, taskId?: string) {
    return this.tools.execute(toolName, input, taskId);
  }

  listProviders() {
    return this.providerFactory.listProviders();
  }
}
