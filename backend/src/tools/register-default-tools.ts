import { Pool } from "pg";

import { CalculatorTool } from "./implementations/calculator.tool";
import { DatabaseQueryTool } from "./implementations/database-query.tool";
import { DocumentationSearchTool } from "./implementations/documentation-search.tool";
import { FileSearchTool } from "./implementations/file-search.tool";
import { RepositorySearchTool } from "./implementations/repository-search.tool";
import { WebSearchTool } from "./implementations/web-search.tool";
import { ToolRegistry } from "./registry/tool-registry";

export function registerDefaultTools(registry: ToolRegistry, pool: Pool): void {
  registry.register(new FileSearchTool());
  registry.register(new RepositorySearchTool());
  registry.register(new DocumentationSearchTool());
  registry.register(new CalculatorTool());
  registry.register(new DatabaseQueryTool(pool));
  registry.register(new WebSearchTool());
}
