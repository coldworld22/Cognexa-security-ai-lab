export interface ToolMetadata {
  name: string;
  description: string;
  category: "filesystem" | "repository" | "documentation" | "math" | "database" | "web";
  inputSchema: Record<string, unknown>;
}

export abstract class BaseTool<TInput, TOutput> {
  abstract readonly metadata: ToolMetadata;

  abstract execute(input: TInput): Promise<TOutput>;
}
