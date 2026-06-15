import { Logger } from "pino";

import { BaseTool } from "../base-tool";

export class ToolRegistry {
  private readonly tools = new Map<string, BaseTool<any, unknown>>();

  constructor(private readonly logger: Logger) {}

  register(tool: BaseTool<any, unknown>) {
    this.tools.set(tool.metadata.name, tool);
    this.logger.debug({ tool: tool.metadata.name }, "Registered tool");
  }

  get(name: string) {
    return this.tools.get(name);
  }

  list() {
    return Array.from(this.tools.values()).map((tool) => tool.metadata);
  }

  discover(query: string) {
    const normalized = query.toLowerCase();
    return this.list().filter(
      (tool) =>
        tool.name.toLowerCase().includes(normalized) ||
        tool.description.toLowerCase().includes(normalized)
    );
  }
}
