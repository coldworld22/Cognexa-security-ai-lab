import { ConversationRepository } from "../../database/repositories/conversation.repository";
import { MessageRepository } from "../../database/repositories/message.repository";
import { TaskRepository } from "../../database/repositories/task.repository";
import { ToolExecutionRepository } from "../../database/repositories/tool-execution.repository";
import { UserRepository } from "../../database/repositories/user.repository";

export class AdminService {
  constructor(
    private readonly users: UserRepository,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly toolExecutions: ToolExecutionRepository,
    private readonly tasks: TaskRepository
  ) {}

  async getDashboard() {
    const [users, conversations, messages, toolExecutions, tasks] = await Promise.all([
      this.users.count(),
      this.conversations.count(),
      this.messages.count(),
      this.toolExecutions.count(),
      this.tasks.count()
    ]);

    return {
      metrics: {
        users,
        conversations,
        messages,
        toolExecutions,
        tasks
      },
      modelUsage: [
        { provider: "qwen", requests: 0 },
        { provider: "llama", requests: 0 },
        { provider: "mistral", requests: 0 },
        { provider: "gemma", requests: 0 }
      ]
    };
  }
}
