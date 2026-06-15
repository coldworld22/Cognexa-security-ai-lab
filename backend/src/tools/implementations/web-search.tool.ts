import { BaseTool } from "../base-tool";

interface WebSearchInput {
  query: string;
}

export class WebSearchTool extends BaseTool<
  WebSearchInput,
  { provider: string; results: Array<Record<string, unknown>> }
> {
  readonly metadata = {
    name: "web-search",
    description: "Abstract web search entrypoint ready for an external provider adapter.",
    category: "web" as const,
    inputSchema: {
      query: "string"
    }
  };

  async execute(_input: WebSearchInput) {
    return {
      provider: "unconfigured",
      results: []
    };
  }
}
