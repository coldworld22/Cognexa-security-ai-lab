import { Logger } from "pino";
import { RedisClientType } from "redis";

import {
  AccessContext,
  AuthorizationAuditEvent,
  CanonicalUserRole,
  Permission
} from "../../authorization/authorization.types";
import { getPermissionsForRole } from "../../authorization/role-permission-matrix";
import { UserRepository } from "../../database/repositories/user.repository";
import { AuthorizationAuditLogRepository } from "../../database/repositories/authorization-audit-log.repository";
import { AppError } from "../../utils/app-error";
import { WorkspaceService } from "../workspace/workspace.service";

interface AuthorizationServiceOptions {
  cacheTtlSeconds: number;
}

export class AuthorizationService {
  constructor(
    private readonly users: UserRepository,
    private readonly auditLogs: AuthorizationAuditLogRepository,
    private readonly redis: RedisClientType,
    private readonly logger: Logger,
    private readonly workspaces: WorkspaceService,
    private readonly options: AuthorizationServiceOptions
  ) {}

  async getUserAccessContext(
    userId: string,
    emailHint?: string,
    requestedWorkspaceId?: string
  ): Promise<AccessContext> {
    const cacheKey = this.getUserContextCacheKey(userId, requestedWorkspaceId);
    const cached = await this.safeGetJson<AccessContext>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError("Authenticated user not found", 401);
    }

    const selection = await this.workspaces.resolveWorkspaceSelection(
      user,
      requestedWorkspaceId
    );

    const context: AccessContext = {
      userId: user.id,
      email: user.email ?? emailHint ?? "",
      displayName: user.displayName,
      role: user.role === "user" ? "developer" : user.role,
      workspaceId: selection.workspace.id,
      workspaceName: selection.workspace.name,
      workspaceSlug: selection.workspace.slug,
      workspaceRole: selection.workspace.role,
      organizationId: selection.workspace.organizationId,
      organizationName: selection.workspace.organizationName,
      isPersonalWorkspace: selection.workspace.isPersonal,
      permissions: getPermissionsForRole(user.role)
    };

    await this.safeSetJson(cacheKey, context);
    return context;
  }

  async getPermissionsForActor(actor: AccessContext): Promise<Permission[]> {
    if (actor.permissions && actor.permissions.length > 0) {
      return actor.permissions;
    }

    const cacheKey = this.getPermissionCacheKey(actor.userId, actor.role);
    const cached = await this.safeGetJson<Permission[]>(cacheKey);
    if (cached) {
      actor.permissions = cached;
      return cached;
    }

    const permissions = getPermissionsForRole(actor.role);
    actor.permissions = permissions;
    await this.safeSetJson(cacheKey, permissions);
    return permissions;
  }

  async assertPermission(
    actor: AccessContext,
    permission: Permission,
    event: Omit<AuthorizationAuditEvent, "actor" | "permission">
  ): Promise<void> {
    const permissions = await this.getPermissionsForActor(actor);
    if (permissions.includes(permission)) {
      return;
    }

    await this.recordDeniedAccess({
      actor,
      permission,
      ...event
    });

    throw new AppError("Forbidden", 403, {
      permission,
      resource: event.resource,
      action: event.action
    });
  }

  async invalidateUserCaches(
    userId: string,
    roles: Array<CanonicalUserRole | "user"> = [],
    workspaceIds: string[] = []
  ): Promise<void> {
    const candidateWorkspaceIds =
      workspaceIds.length > 0
        ? workspaceIds
        : await this.workspaces.listWorkspaceIdsForUser(userId).catch(() => []);

    const keys = new Set<string>([this.getUserContextCacheKey(userId)]);
    for (const workspaceId of candidateWorkspaceIds) {
      keys.add(this.getUserContextCacheKey(userId, workspaceId));
    }

    for (const role of roles) {
      const normalizedRole = role === "user" ? "developer" : role;
      keys.add(this.getPermissionCacheKey(userId, normalizedRole));
    }

    if (keys.size === 0) {
      return;
    }

    try {
      const keysToDelete = Array.from(keys);
      if (keysToDelete.length === 1) {
        await this.redis.del(keysToDelete[0]!);
      } else if (keysToDelete.length > 1) {
        await this.redis.del(keysToDelete as unknown as string[]);
      }
    } catch (error) {
      this.logger.warn({ error, userId }, "Failed to invalidate authorization cache");
    }
  }

  private async recordDeniedAccess(event: AuthorizationAuditEvent): Promise<void> {
    try {
      await this.auditLogs.create({
        userId: event.actor?.userId,
        userEmail: event.actor?.email,
        userRole: event.actor?.role,
        permission: event.permission,
        layer: event.layer,
        resource: event.resource,
        action: event.action,
        outcome: "denied",
        reason: event.reason,
        metadata: event.metadata
      });
    } catch (error) {
      this.logger.error({ error, event }, "Failed to persist authorization audit log");
    }

    this.logger.warn(
      {
        userId: event.actor?.userId,
        role: event.actor?.role,
        permission: event.permission,
        layer: event.layer,
        resource: event.resource,
        action: event.action,
        reason: event.reason,
        metadata: event.metadata
      },
      "Authorization denied"
    );
  }

  private async safeGetJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.debug({ error, key }, "Authorization cache read failed");
      return null;
    }
  }

  private async safeSetJson(key: string, value: unknown): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), {
        EX: this.options.cacheTtlSeconds
      });
    } catch (error) {
      this.logger.debug({ error, key }, "Authorization cache write failed");
    }
  }

  private getPermissionCacheKey(userId: string, role: CanonicalUserRole): string {
    return `authz:permissions:${userId}:${role}`;
  }

  private getUserContextCacheKey(userId: string, workspaceId?: string): string {
    return `authz:user-context:${userId}:${workspaceId ?? "default"}`;
  }
}
