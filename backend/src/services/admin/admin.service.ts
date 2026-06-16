import { AccessContext, CanonicalUserRole } from "../../authorization/authorization.types";
import { ConversationRepository } from "../../database/repositories/conversation.repository";
import { FileRepository } from "../../database/repositories/file.repository";
import { MessageRepository } from "../../database/repositories/message.repository";
import { TaskRepository } from "../../database/repositories/task.repository";
import { ToolExecutionRepository } from "../../database/repositories/tool-execution.repository";
import { UserRepository } from "../../database/repositories/user.repository";
import { AuthorizationService } from "../authorization/authorization.service";
import { HealthService } from "../health/health.service";
import { AppError } from "../../utils/app-error";

export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  role: CanonicalUserRole;
  preferences: Record<string, unknown>;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class AdminService {
  constructor(
    private readonly users: UserRepository,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly files: FileRepository,
    private readonly toolExecutions: ToolExecutionRepository,
    private readonly tasks: TaskRepository,
    private readonly health: HealthService,
    private readonly authorization: AuthorizationService
  ) {}

  async getDashboard(actor: AccessContext) {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.dashboard",
      action: "view_admin_dashboard",
      reason: "Admin dashboard requires 'admin_dashboard' permission"
    });

    const [
      users,
      conversations,
      conversationsLast7Days,
      messages,
      files,
      toolExecutions,
      tasks,
      modelUsage,
      health
    ] = await Promise.all([
      this.users.count(),
      this.conversations.count(),
      this.conversations.countCreatedSince("7 days"),
      this.messages.count(),
      this.files.getSummary(),
      this.toolExecutions.getSummary(),
      this.tasks.count(),
      this.conversations.getUsageByProvider(),
      this.health.getSnapshot()
    ]);

    return {
      metrics: {
        users,
        conversations: {
          total: conversations,
          last7Days: conversationsLast7Days
        },
        messages,
        files,
        toolExecutions,
        tasks,
        localModel: {
          status: health.dependencies.localModel.status,
          endpoint: health.dependencies.localModel.endpoint,
          latencyMs: health.dependencies.localModel.latencyMs ?? null,
          providerCount: health.dependencies.llmProviders.filter(
            (provider) => provider.models.length > 0
          ).length
        }
      },
      modelUsage,
      health
    };
  }

  async listUsers(actor: AccessContext, limit = 50): Promise<ManagedUser[]> {
    await this.authorization.assertPermission(actor, "user_management", {
      layer: "service",
      resource: "admin.users",
      action: "list_users",
      reason: "User management requires 'user_management' permission"
    });

    const users = await this.users.listUsers(limit);
    return users.map((user) => this.toManagedUser(user));
  }

  async updateUserRole(
    actor: AccessContext,
    userId: string,
    role: CanonicalUserRole
  ): Promise<ManagedUser> {
    await this.authorization.assertPermission(actor, "user_management", {
      layer: "service",
      resource: `admin.users.${userId}.role`,
      action: "update_user_role",
      reason: "User management requires 'user_management' permission"
    });

    if (actor.userId === userId) {
      throw new AppError("You cannot change your own role", 400);
    }

    const existingUser = await this.users.findById(userId);
    if (!existingUser) {
      throw new AppError("User not found", 404);
    }

    const normalizedExistingRole =
      existingUser.role === "user" ? "developer" : existingUser.role;

    if (actor.role !== "super_admin") {
      if (normalizedExistingRole === "super_admin") {
        throw new AppError("Only Super Admin can manage Super Admin accounts", 403);
      }

      if (role === "super_admin") {
        throw new AppError("Only Super Admin can assign the Super Admin role", 403);
      }
    }

    const updatedUser = await this.users.updateRole(userId, role);
    await this.authorization.invalidateUserCaches(userId, [
      existingUser.role,
      role
    ]);

    return this.toManagedUser(updatedUser);
  }

  private toManagedUser(user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    preferences: Record<string, unknown>;
    lastLoginAt?: string;
    createdAt: string;
    updatedAt: string;
  }): ManagedUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role === "user" ? "developer" : (user.role as CanonicalUserRole),
      preferences: user.preferences,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}
