import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { AuthorizationAuditLogEntity } from "../entities/authorization-audit-log.entity";

interface CreateAuthorizationAuditLogInput {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  permission: AuthorizationAuditLogEntity["permission"];
  layer: AuthorizationAuditLogEntity["layer"];
  resource: string;
  action: string;
  outcome?: AuthorizationAuditLogEntity["outcome"];
  reason: string;
  metadata?: Record<string, unknown>;
}

export class AuthorizationAuditLogRepository extends BaseRepository {
  async create(input: CreateAuthorizationAuditLogInput): Promise<AuthorizationAuditLogEntity> {
    const entity: AuthorizationAuditLogEntity = {
      id: randomUUID(),
      userId: input.userId,
      userEmail: input.userEmail,
      userRole: input.userRole,
      permission: input.permission,
      layer: input.layer,
      resource: input.resource,
      action: input.action,
      outcome: input.outcome ?? "denied",
      reason: input.reason,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO authorization_audit_logs (
         id,
         user_id,
         user_email,
         user_role,
         permission,
         layer,
       resource,
       action,
       outcome,
       reason,
       metadata,
        created_at,
        updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)`,
      [
        entity.id,
        entity.userId ?? null,
        entity.userEmail ?? null,
        entity.userRole ?? null,
        entity.permission,
        entity.layer,
        entity.resource,
        entity.action,
        entity.outcome,
        entity.reason,
        JSON.stringify(entity.metadata),
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return entity;
  }
}
