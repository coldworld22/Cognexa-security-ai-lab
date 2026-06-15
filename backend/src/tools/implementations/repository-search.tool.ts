import { FileSearchTool } from "./file-search.tool";

interface RepositorySearchInput {
  query: string;
  maxResults?: number;
}

export class RepositorySearchTool extends FileSearchTool {
  override readonly metadata = {
    name: "repository-search",
    description: "Search source code across the repository roots.",
    category: "repository" as const,
    inputSchema: {
      query: "string",
      maxResults: "number"
    }
  };

  override execute(input: RepositorySearchInput) {
    return super.execute({
      ...input,
      rootPath: "."
    });
  }
}
