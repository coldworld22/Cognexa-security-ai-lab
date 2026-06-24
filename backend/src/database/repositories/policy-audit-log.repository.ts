import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { PolicyAuditLogEntity } from "../entities/policy-audit-log.entity";
import {
  PolicyCategory,
  PolicyDecision,
  PolicyMode,
  PolicyScopeType
} from "../../policy/policy.types";

interface CreatePolicyAuditLogInput {
  userId?: string;
  workspaceId?: string;
  organizationId?: string;
  action: string;
  category: PolicyCategory;
  toolName?: string;
  model?: string;
  provider?: string;
  decision: PolicyDecision;
  mode: PolicyMode;
  policyId?: string;
  matchedRuleId?: string;
  scopeType: PolicyScopeType;
  scopeId?: string;
  requestContext?: Record<string, unknown>;
}

interface ListPolicyAuditLogFilters {
  workspaceId?: string;
  limit?: number;
}

export class PolicyAuditLogRepository extends BaseRepository {
  async create(
    input: CreatePolicyAuditLogInput
  ): Promise<PolicyAuditLogEntity> {
    const entity: PolicyAuditLogEntity = {
      id: randomUUID(),
      userId: input.userId,
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      action: input.action,
      category: input.category,
      toolName: input.toolName,
      model: input.model,
      provider: input.provider,
      decision: input.decision,
      mode: input.mode,
      policyId: input.policyId,
      matchedRuleId: input.matchedRuleId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      requestContext: input.requestContext ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO policy_audit_logs (
         id,
         user_id,
         workspace_id,
         organization_id,
         action,
         category,
         tool_name,
         model,
         provider,
         decision,
         mode,
         policy_id,
         matched_rule_id,
         scope_type,
         scope_id,
         request_context,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18)`,
      [
        entity.id,
        entity.userId ?? null,
        entity.workspaceId ?? null,
        entity.organizationId ?? null,
        entity.action,
        entity.category,
        entity.toolName ?? null,
        entity.model ?? null,
        entity.provider ?? null,
        entity.decision,
        entity.mode,
        entity.policyId ?? null,
        entity.matchedRuleId ?? null,
        entity.scopeType,
        entity.scopeId ?? null,
        JSON.stringify(entity.requestContext),
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return entity;
  }

  async list(filters: ListPolicyAuditLogFilters = {}): Promise<PolicyAuditLogEntity[]> {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters.workspaceId) {
      params.push(filters.workspaceId);
      conditions.push(`workspace_id = $${params.length}`);
    }

    params.push(filters.limit ?? 100);

    const result = await this.pool.query(
      `SELECT
         id,
         user_id,
         workspace_id,
         organization_id,
         action,
         category,
         tool_name,
         model,
         provider,
         decision,
         mode,
         policy_id,
         matched_rule_id,
         scope_type,
         scope_id,
         request_context,
         created_at,
         updated_at
       FROM policy_audit_logs
       ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      userId: (row.user_id as string | null) ?? undefined,
      workspaceId: (row.workspace_id as string | null) ?? undefined,
      organizationId: (row.organization_id as string | null) ?? undefined,
      action: row.action as string,
      category: row.category as PolicyCategory,
      toolName: (row.tool_name as string | null) ?? undefined,
      model: (row.model as string | null) ?? undefined,
      provider: (row.provider as string | null) ?? undefined,
      decision: row.decision as PolicyDecision,
      mode: row.mode as PolicyMode,
      policyId: (row.policy_id as string | null) ?? undefined,
      matchedRuleId: (row.matched_rule_id as string | null) ?? undefined,
      scopeType: row.scope_type as PolicyScopeType,
      scopeId: (row.scope_id as string | null) ?? undefined,
      requestContext: (row.request_context as Record<string, unknown>) ?? {},
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    }));
  }
}
