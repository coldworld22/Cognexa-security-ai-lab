import { randomUUID } from "crypto";

import { PoolClient } from "pg";

import { BaseRepository } from "./base.repository";
import {
  PolicyAssignmentEntity,
  PolicyEntity,
  PolicyRuleEntity
} from "../entities/policy.entity";
import {
  DEFAULT_WORKSPACE_POLICY_MODE,
  PolicyAssignmentInput,
  PolicyMode,
  PolicyScopeType,
  PolicyUpsertInput
} from "../../policy/policy.types";

interface PolicyListFilters {
  includeSystem?: boolean;
  ids?: string[];
}

interface ApplicablePolicyFilters {
  organizationId: string;
  workspaceId: string;
  userId: string;
}

export class PolicyRepository extends BaseRepository {
  async listPolicies(filters: PolicyListFilters = {}): Promise<PolicyEntity[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!filters.includeSystem) {
      params.push(false);
      conditions.push(`is_system = $${params.length}`);
    }

    if (filters.ids && filters.ids.length > 0) {
      params.push(filters.ids);
      conditions.push(`id = ANY($${params.length}::uuid[])`);
    }

    const query = `
      SELECT
        id,
        name,
        description,
        mode,
        is_system,
        is_active,
        created_by_user_id,
        metadata,
        created_at,
        updated_at
      FROM policies
      ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY is_system DESC, created_at ASC
    `;

    const result = await this.pool.query(query, params);
    return this.inflatePolicies(result.rows);
  }

  async findById(id: string): Promise<PolicyEntity | null> {
    const policies = await this.listPolicies({
      includeSystem: true,
      ids: [id]
    });
    return policies[0] ?? null;
  }

  async findSystemPolicyByMode(mode: PolicyMode): Promise<PolicyEntity | null> {
    const result = await this.pool.query(
      `SELECT
         id,
         name,
         description,
         mode,
         is_system,
         is_active,
         created_by_user_id,
         metadata,
         created_at,
         updated_at
       FROM policies
       WHERE is_system = TRUE
         AND mode = $1
         AND COALESCE(metadata->>'policyClass', 'mode') = 'mode'
       ORDER BY created_at ASC
       LIMIT 1`,
      [mode]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return (await this.inflatePolicies(result.rows))[0] ?? null;
  }

  async getActiveWorkspaceModeAssignment(
    workspaceId: string
  ): Promise<PolicyAssignmentEntity | null> {
    const result = await this.pool.query(
      `SELECT
         id,
         policy_id,
         scope_type,
         scope_id,
         assignment_type,
         mode,
         priority,
         is_active,
         created_at,
         updated_at
       FROM policy_assignments
       WHERE scope_type = 'workspace'
         AND scope_id = $1
         AND assignment_type = 'mode'
         AND is_active = TRUE
       ORDER BY updated_at DESC
       LIMIT 1`,
      [workspaceId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapAssignmentRow(result.rows[0]!);
  }

  async listApplicablePolicies(
    filters: ApplicablePolicyFilters
  ): Promise<PolicyEntity[]> {
    const assignmentResult = await this.pool.query(
      `SELECT DISTINCT policy_id
       FROM policy_assignments
       WHERE is_active = TRUE
         AND (
           scope_type = 'global'
           OR (scope_type = 'organization' AND scope_id = $1)
           OR (scope_type = 'workspace' AND scope_id = $2)
           OR (scope_type = 'user' AND scope_id = $3)
         )`,
      [
        filters.organizationId,
        filters.workspaceId,
        filters.userId
      ]
    );

    const ids = assignmentResult.rows.map((row) => row.policy_id as string);
    if (ids.length === 0) {
      return [];
    }

    return this.listPolicies({
      includeSystem: true,
      ids
    });
  }

  async createPolicy(
    input: PolicyUpsertInput & {
      createdByUserId?: string;
      isSystem?: boolean;
    }
  ): Promise<PolicyEntity> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const policyId = randomUUID();
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO policies (
           id,
           name,
           description,
           mode,
           is_system,
           is_active,
           created_by_user_id,
           metadata,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
        [
          policyId,
          input.name,
          input.description ?? "",
          input.mode ?? "custom",
          input.isSystem ?? false,
          input.isActive ?? true,
          input.createdByUserId ?? null,
          JSON.stringify(input.metadata ?? {}),
          now,
          now
        ]
      );

      await this.replaceRules(client, policyId, input.rules, now);
      await this.replaceAssignments(client, policyId, input.assignments, now);

      await client.query("COMMIT");
      return (await this.findById(policyId))!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePolicy(
    policyId: string,
    input: PolicyUpsertInput
  ): Promise<PolicyEntity> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const now = new Date().toISOString();
      await client.query(
        `UPDATE policies
         SET name = $2,
             description = $3,
             mode = $4,
             is_active = $5,
             metadata = $6::jsonb,
             updated_at = $7
         WHERE id = $1`,
        [
          policyId,
          input.name,
          input.description ?? "",
          input.mode ?? "custom",
          input.isActive ?? true,
          JSON.stringify(input.metadata ?? {}),
          now
        ]
      );

      await client.query(`DELETE FROM policy_rules WHERE policy_id = $1`, [policyId]);
      await client.query(
        `DELETE FROM policy_assignments
         WHERE policy_id = $1
           AND assignment_type <> 'baseline'`,
        [policyId]
      );

      await this.replaceRules(client, policyId, input.rules, now);
      await this.replaceAssignments(client, policyId, input.assignments, now);

      await client.query("COMMIT");
      return (await this.findById(policyId))!;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deletePolicy(policyId: string): Promise<void> {
    await this.pool.query(`DELETE FROM policies WHERE id = $1`, [policyId]);
  }

  async ensureWorkspaceModeAssignment(
    workspaceId: string,
    createdByUserId?: string,
    mode: PolicyMode = DEFAULT_WORKSPACE_POLICY_MODE
  ): Promise<void> {
    const existing = await this.getActiveWorkspaceModeAssignment(workspaceId);
    if (existing) {
      return;
    }

    const systemPolicy = await this.findSystemPolicyByMode(mode);
    if (!systemPolicy) {
      throw new Error(`System policy mode '${mode}' is not available`);
    }

    const now = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO policy_assignments (
         id,
         policy_id,
         scope_type,
         scope_id,
         assignment_type,
         mode,
         priority,
         is_active,
         created_by_user_id,
         created_at,
         updated_at
       )
       VALUES ($1, $2, 'workspace', $3, 'mode', $4, 100, TRUE, $5, $6, $7)`,
      [
        randomUUID(),
        systemPolicy.id,
        workspaceId,
        mode,
        createdByUserId ?? null,
        now,
        now
      ]
    );
  }

  async replaceWorkspaceModeAssignment(
    workspaceId: string,
    policyId: string,
    mode: PolicyMode,
    createdByUserId?: string
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE policy_assignments
         SET is_active = FALSE,
             updated_at = NOW()
         WHERE scope_type = 'workspace'
           AND scope_id = $1
           AND assignment_type = 'mode'
           AND is_active = TRUE`,
        [workspaceId]
      );

      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO policy_assignments (
           id,
           policy_id,
           scope_type,
           scope_id,
           assignment_type,
           mode,
           priority,
           is_active,
           created_by_user_id,
           created_at,
           updated_at
         )
         VALUES ($1, $2, 'workspace', $3, 'mode', $4, 100, TRUE, $5, $6, $7)`,
        [
          randomUUID(),
          policyId,
          workspaceId,
          mode,
          createdByUserId ?? null,
          now,
          now
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async inflatePolicies(
    policyRows: Array<Record<string, unknown>>
  ): Promise<PolicyEntity[]> {
    if (policyRows.length === 0) {
      return [];
    }

    const policyIds = policyRows.map((row) => row.id as string);
    const [rulesResult, assignmentsResult] = await Promise.all([
      this.pool.query(
        `SELECT
           id,
           policy_id,
           category,
           decision,
           enabled,
           priority,
           description,
           tool_names,
           role_scopes,
           workspace_role_scopes,
           model_patterns,
           conditions,
           created_at,
           updated_at
         FROM policy_rules
         WHERE policy_id = ANY($1::uuid[])
         ORDER BY priority DESC, created_at ASC`,
        [policyIds]
      ),
      this.pool.query(
        `SELECT
           id,
           policy_id,
           scope_type,
           scope_id,
           assignment_type,
           mode,
           priority,
           is_active,
           created_at,
           updated_at
         FROM policy_assignments
         WHERE policy_id = ANY($1::uuid[])
         ORDER BY created_at ASC`,
        [policyIds]
      )
    ]);

    const rulesByPolicyId = new Map<string, PolicyRuleEntity[]>();
    for (const row of rulesResult.rows) {
      const rule = this.mapRuleRow(row);
      const existing = rulesByPolicyId.get(rule.policyId) ?? [];
      existing.push(rule);
      rulesByPolicyId.set(rule.policyId, existing);
    }

    const assignmentsByPolicyId = new Map<string, PolicyAssignmentEntity[]>();
    for (const row of assignmentsResult.rows) {
      const assignment = this.mapAssignmentRow(row);
      const existing = assignmentsByPolicyId.get(assignment.policyId) ?? [];
      existing.push(assignment);
      assignmentsByPolicyId.set(assignment.policyId, existing);
    }

    return policyRows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      mode: row.mode as PolicyMode,
      isSystem: row.is_system as boolean,
      isActive: row.is_active as boolean,
      createdByUserId: (row.created_by_user_id as string | null) ?? undefined,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      rules: rulesByPolicyId.get(row.id as string) ?? [],
      assignments: assignmentsByPolicyId.get(row.id as string) ?? [],
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    }));
  }

  private mapRuleRow(row: Record<string, unknown>): PolicyRuleEntity {
    return {
      id: row.id as string,
      policyId: row.policy_id as string,
      category: row.category as PolicyRuleEntity["category"],
      decision: row.decision as PolicyRuleEntity["decision"],
      enabled: row.enabled as boolean,
      priority: row.priority as number,
      description: (row.description as string | null) ?? undefined,
      toolNames: (row.tool_names as string[] | null) ?? [],
      roleScopes: (row.role_scopes as PolicyRuleEntity["roleScopes"] | null) ?? [],
      workspaceRoleScopes:
        (row.workspace_role_scopes as PolicyRuleEntity["workspaceRoleScopes"] | null) ?? [],
      modelPatterns:
        (row.model_patterns as PolicyRuleEntity["modelPatterns"] | null) ?? [],
      conditions:
        (row.conditions as PolicyRuleEntity["conditions"] | null) ?? {},
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }

  private mapAssignmentRow(row: Record<string, unknown>): PolicyAssignmentEntity {
    return {
      id: row.id as string,
      policyId: row.policy_id as string,
      scopeType: row.scope_type as PolicyScopeType,
      scopeId: (row.scope_id as string | null) ?? undefined,
      assignmentType: row.assignment_type as PolicyAssignmentEntity["assignmentType"],
      mode: (row.mode as PolicyMode | null) ?? undefined,
      priority: row.priority as number,
      isActive: row.is_active as boolean,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }

  private async replaceRules(
    client: PoolClient,
    policyId: string,
    rules: PolicyUpsertInput["rules"],
    now: string
  ): Promise<void> {
    for (const rule of rules) {
      await client.query(
        `INSERT INTO policy_rules (
           id,
           policy_id,
           category,
           decision,
           enabled,
           priority,
           description,
           tool_names,
           role_scopes,
           workspace_role_scopes,
           model_patterns,
           conditions,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14)`,
        [
          rule.id ?? randomUUID(),
          policyId,
          rule.category,
          rule.decision,
          rule.enabled ?? true,
          rule.priority ?? 100,
          rule.description ?? null,
          JSON.stringify(rule.toolNames ?? []),
          JSON.stringify(rule.roleScopes ?? []),
          JSON.stringify(rule.workspaceRoleScopes ?? []),
          JSON.stringify(rule.modelPatterns ?? []),
          JSON.stringify(rule.conditions ?? {}),
          now,
          now
        ]
      );
    }
  }

  private async replaceAssignments(
    client: PoolClient,
    policyId: string,
    assignments: PolicyAssignmentInput[],
    now: string
  ): Promise<void> {
    for (const assignment of assignments) {
      await client.query(
        `INSERT INTO policy_assignments (
           id,
           policy_id,
           scope_type,
           scope_id,
           assignment_type,
           mode,
           priority,
           is_active,
           created_at,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          assignment.id ?? randomUUID(),
          policyId,
          assignment.scopeType,
          assignment.scopeId ?? null,
          assignment.assignmentType ?? "overlay",
          assignment.mode ?? null,
          assignment.priority ?? 100,
          assignment.isActive ?? true,
          now,
          now
        ]
      );
    }
  }
}
