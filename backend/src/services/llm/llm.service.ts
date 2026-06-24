import { z } from "zod";

import { AccessContext } from "../../authorization/authorization.types";
import {
  LLMCompletionRequest,
  LLMMessage,
  ToolCallDefinition
} from "../../llm/base-llm-provider";
import { ProviderFactory } from "../../llm/provider-factory";
import {
  POLICY_CATEGORIES,
  PolicyCategory,
  inferPolicyCategoriesFromText
} from "../../policy/policy.types";
import { ToolExecutionService } from "../tool-execution/tool-execution.service";
import { PolicyService } from "../policy/policy.service";

interface ChatReplyInput {
  provider: string;
  model: string;
  messages: LLMMessage[];
  tools?: ToolCallDefinition[];
  policy?: LLMPolicyContext;
}

interface LLMPolicyContext {
  actor: AccessContext;
  action: string;
  categories?: PolicyCategory[];
  content?: string;
  metadata?: Record<string, unknown>;
}

export class LLMService {
  constructor(
    private readonly providerFactory: ProviderFactory,
    private readonly tools: ToolExecutionService,
    private readonly policy: PolicyService
  ) {}

  async createReply(input: ChatReplyInput) {
    await this.evaluatePolicy(input.provider, input.model, input.policy);
    const provider = this.providerFactory.getProvider(input.provider);
    return provider.generate({
      model: input.model,
      messages: input.messages,
      tools: input.tools
    });
  }

  async *streamReply(input: ChatReplyInput) {
    await this.evaluatePolicy(input.provider, input.model, input.policy);
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
    schema: TSchema,
    policy?: LLMPolicyContext
  ): Promise<z.infer<TSchema>> {
    await this.evaluatePolicy(providerId, request.model, policy);
    const provider = this.providerFactory.getProvider(providerId);
    return provider.generateStructured(request, schema);
  }

  async callTool(
    actor: AccessContext,
    toolName: string,
    input: Record<string, unknown>,
    taskId?: string
  ) {
    return this.tools.execute(toolName, input, {
      actor,
      taskId,
      resource: `llm.tools.${toolName}`,
      action: "call_tool_from_llm",
      reason: `Tool '${toolName}' requires 'tools' permission`
    });
  }

  async listProviders() {
    return this.providerFactory.listProviders();
  }

  private async evaluatePolicy(
    provider: string,
    model: string,
    policy?: LLMPolicyContext
  ): Promise<void> {
    if (!policy) {
      return;
    }

    const categories =
      policy.categories && policy.categories.length > 0
        ? policy.categories
        : inferPolicyCategoriesFromText(policy.content ?? "");
    const effectiveCategories: PolicyCategory[] =
      categories.length > 0
        ? categories
        : [POLICY_CATEGORIES[0]];

    await this.policy.evaluatePolicy({
      actor: policy.actor,
      action: policy.action,
      categories: effectiveCategories,
      provider,
      model,
      content: policy.content,
      metadata: policy.metadata
    });
  }
}
