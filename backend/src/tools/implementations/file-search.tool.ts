import { readFile, readdir, stat } from "fs/promises";
import path from "path";

import { BaseTool, ToolMetadata } from "../base-tool";

interface FileSearchInput {
  rootPath?: string;
  query: string;
  maxResults?: number;
}

export class FileSearchTool extends BaseTool<FileSearchInput, { matches: Array<Record<string, unknown>> }> {
  readonly metadata: ToolMetadata = {
    name: "file-search",
    description: "Search text content across files on disk.",
    category: "filesystem" as const,
    inputSchema: {
      rootPath: "string",
      query: "string",
      maxResults: "number"
    }
  };

  async execute(input: FileSearchInput) {
    const rootPath = path.resolve(process.cwd(), input.rootPath ?? ".");
    const maxResults = input.maxResults ?? 10;
    const matches: Array<Record<string, unknown>> = [];

    async function walk(currentPath: string): Promise<void> {
      if (matches.length >= maxResults) {
        return;
      }

      const entries = await readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (matches.length >= maxResults) {
          return;
        }

        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          if (["node_modules", ".git", "dist"].includes(entry.name)) {
            continue;
          }
          await walk(fullPath);
        } else {
          const fileStats = await stat(fullPath);
          if (fileStats.size > 1_000_000) {
            continue;
          }
          const content = await readFile(fullPath, "utf-8").catch(() => "");
          if (content.toLowerCase().includes(input.query.toLowerCase())) {
            matches.push({
              path: fullPath,
              preview: content.slice(0, 240)
            });
          }
        }
      }
    }

    await walk(rootPath);
    return { matches };
  }
}
