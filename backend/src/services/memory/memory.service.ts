import { AccessContext } from "../../authorization/authorization.types";
import { MemoryRepository } from "../../database/repositories/memory.repository";
import { MessageRepository } from "../../database/repositories/message.repository";
import { AuthorizationService } from "../authorization/authorization.service";

export class MemoryService {
  constructor(
    private readonly memories: MemoryRepository,
    private readonly messages: MessageRepository,
    private readonly authorization: AuthorizationService
  ) {}

  async getUserContext(actor: AccessContext) {
    await this.authorization.assertPermission(actor, "memory", {
      layer: "service",
      resource: "memory.context",
      action: "get_memory_context",
      reason: "Memory access requires 'memory' permission"
    });

    const [memories, recentMessages] = await Promise.all([
      this.memories.listByWorkspaceAndUser(actor.workspaceId, actor.userId),
      this.messages.listRecentByWorkspaceAndUser(actor.workspaceId, actor.userId, 8)
    ]);

    return {
      preferences: memories.filter((entry) => entry.memoryType === "preference"),
      longTerm: memories.filter((entry) => entry.memoryType === "long_term"),
      shortTerm: recentMessages
    };
  }

  async savePreference(actor: AccessContext, key: string, value: string) {
    await this.authorization.assertPermission(actor, "memory", {
      layer: "service",
      resource: `memory.preferences.${key}`,
      action: "save_memory_preference",
      reason: "Memory updates require 'memory' permission"
    });

    return this.memories.upsert({
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      memoryType: "preference",
      key,
      value
    });
  }
}
