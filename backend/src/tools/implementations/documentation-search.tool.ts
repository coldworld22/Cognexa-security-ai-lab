import { FileSearchTool } from "./file-search.tool";

interface DocumentationSearchInput {
  query: string;
  maxResults?: number;
}

export class DocumentationSearchTool extends FileSearchTool {
  override readonly metadata = {
    name: "documentation-search",
    description: "Search platform documentation, ADRs, and runbooks.",
    category: "documentation" as const,
    inputSchema: {
      query: "string",
      maxResults: "number"
    }
  };

  override execute(input: DocumentationSearchInput) {
    return super.execute({
      ...input,
      rootPath: "docs"
    });
  }
}
