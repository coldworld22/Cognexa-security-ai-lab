export interface ToolMetadata {
  name: string;
  description: string;
  category: "filesystem" | "repository" | "documentation" | "math" | "database" | "web";
  inputSchema: Record<string, unknown>;
  policyDecision?: "allow" | "warn" | "require_approval" | "deny";
  policyWarnings?: string[];
  requiresApproval?: boolean;
  blocked?: boolean;
}

export abstract class BaseTool<TInput, TOutput> {
  abstract readonly metadata: ToolMetadata;

  abstract execute(input: TInput): Promise<TOutput>;
}
