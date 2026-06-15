import { MemoryRepository } from "../../database/repositories/memory.repository";
import { MessageRepository } from "../../database/repositories/message.repository";

export class MemoryService {
  constructor(
    private readonly memories: MemoryRepository,
    private readonly messages: MessageRepository
  ) {}

  async getUserContext(userId: string) {
    const [memories, recentMessages] = await Promise.all([
      this.memories.listByUser(userId),
      this.messages.listRecentByUser(userId, 8)
    ]);

    return {
      preferences: memories.filter((entry) => entry.memoryType === "preference"),
      longTerm: memories.filter((entry) => entry.memoryType === "long_term"),
      shortTerm: recentMessages
    };
  }

  async savePreference(userId: string, key: string, value: string) {
    return this.memories.upsert({
      userId,
      memoryType: "preference",
      key,
      value
    });
  }
}
