import { randomUUID } from "crypto";

import { AuthorizedSecurityTestRunEntity } from "../entities/authorized-security-test-run.entity";
import { BaseRepository } from "./base.repository";
import {
  AuthorizedSecurityAiAnalysis,
  AuthorizedSecurityAttackPath,
  AuthorizedSecurityBaseline,
  AuthorizedSecurityFinding,
  AuthorizedSecurityPlanStep,
  AuthorizedSecurityTestAuthProfileSummary,
  AuthorizedSecurityTestModule,
  AuthorizedSecurityTestRunStatus,
  AuthorizedSecurityTestSummary
} from "../../services/authorized-testing/authorized-security-testing.types";

interface CreateAuthorizedSecurityTestRunInput {
  workspaceId: string;
  organizationId: string;
  verificationId: string;
  requestedByUserId?: string;
  targetUrl: string;
  hostname: string;
  status: AuthorizedSecurityTestRunStatus;
  requestedModules: AuthorizedSecurityTestModule[];
  guardrails: string[];
  redactedAuthProfiles: AuthorizedSecurityTestAuthProfileSummary[];
}

interface UpdateAuthorizedSecurityTestRunInput {
  status: AuthorizedSecurityTestRunStatus;
  baseline?: AuthorizedSecurityBaseline;
  plan?: AuthorizedSecurityPlanStep[];
  summary?: AuthorizedSecurityTestSummary;
  findings?: AuthorizedSecurityFinding[];
  attackPaths?: AuthorizedSecurityAttackPath[];
  aiAnalysis?: AuthorizedSecurityAiAnalysis;
  warnings?: string[];
  startedAt?: string;
  completedAt?: string;
}

const EMPTY_BASELINE: AuthorizedSecurityBaseline = {
  requestedUrl: "",
  finalUrl: "",
  hostname: "",
  pagesScanned: 0,
  maxPages: 0,
  securityScore: 0,
  grade: "F",
  passiveWarnings: []
};

const EMPTY_SUMMARY: AuthorizedSecurityTestSummary = {
  riskLevel: "low",
  headline: "",
  planSource: "deterministic",
  requestBudget: 0,
  requestsSent: 0,
  modulesExecuted: [],
  findingCounts: {
    info: 0,
    low: 0,
    medium: 0,
    high: 0
  },
  recommendedActions: [],
  reversible: true
};

const EMPTY_AI_ANALYSIS: AuthorizedSecurityAiAnalysis = {
  status: "unavailable",
  predictions: [],
  nextSteps: []
};

export class AuthorizedSecurityTestRunRepository extends BaseRepository {
  async create(
    input: CreateAuthorizedSecurityTestRunInput
  ): Promise<AuthorizedSecurityTestRunEntity> {
    const entity: AuthorizedSecurityTestRunEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      verificationId: input.verificationId,
      requestedByUserId: input.requestedByUserId,
      targetUrl: input.targetUrl,
      hostname: input.hostname,
      status: input.status,
      requestedModules: input.requestedModules,
      guardrails: input.guardrails,
      redactedAuthProfiles: input.redactedAuthProfiles,
      baseline: EMPTY_BASELINE,
      plan: [],
      summary: EMPTY_SUMMARY,
      findings: [],
      attackPaths: [],
      aiAnalysis: EMPTY_AI_ANALYSIS,
      warnings: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO authorized_security_test_runs (
         id,
         workspace_id,
         organization_id,
         verification_id,
         requested_by_user_id,
         target_url,
         hostname,
         status,
         requested_modules,
         guardrails,
         redacted_auth_profiles,
         baseline,
         plan,
         summary,
         findings,
         attack_paths,
         ai_analysis,
         warnings,
         created_at,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb,
         $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19, $20
       )`,
      [
        entity.id,
        entity.workspaceId,
        entity.organizationId,
        entity.verificationId,
        entity.requestedByUserId ?? null,
        entity.targetUrl,
        entity.hostname,
        entity.status,
        JSON.stringify(entity.requestedModules),
        JSON.stringify(entity.guardrails),
        JSON.stringify(entity.redactedAuthProfiles),
        JSON.stringify(entity.baseline),
        JSON.stringify(entity.plan),
        JSON.stringify(entity.summary),
        JSON.stringify(entity.findings),
        JSON.stringify(entity.attackPaths),
        JSON.stringify(entity.aiAnalysis),
        JSON.stringify(entity.warnings),
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return entity;
  }

  async findById(id: string): Promise<AuthorizedSecurityTestRunEntity | null> {
    const result = await this.pool.query(
      `SELECT id,
              workspace_id,
              organization_id,
              verification_id,
              requested_by_user_id,
              target_url,
              hostname,
              status,
              requested_modules,
              guardrails,
              redacted_auth_profiles,
              baseline,
              plan,
              summary,
              findings,
              attack_paths,
              ai_analysis,
              warnings,
              started_at,
              completed_at,
              created_at,
              updated_at
         FROM authorized_security_test_runs
        WHERE id = $1
        LIMIT 1`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async listByWorkspace(
    workspaceId: string,
    limit = 20
  ): Promise<AuthorizedSecurityTestRunEntity[]> {
    const result = await this.pool.query(
      `SELECT id,
              workspace_id,
              organization_id,
              verification_id,
              requested_by_user_id,
              target_url,
              hostname,
              status,
              requested_modules,
              guardrails,
              redacted_auth_profiles,
              baseline,
              plan,
              summary,
              findings,
              attack_paths,
              ai_analysis,
              warnings,
              started_at,
              completed_at,
              created_at,
              updated_at
         FROM authorized_security_test_runs
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [workspaceId, limit]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async update(
    runId: string,
    input: UpdateAuthorizedSecurityTestRunInput
  ): Promise<AuthorizedSecurityTestRunEntity> {
    const result = await this.pool.query(
      `UPDATE authorized_security_test_runs
          SET status = $2,
              baseline = COALESCE($3::jsonb, baseline),
              plan = COALESCE($4::jsonb, plan),
              summary = COALESCE($5::jsonb, summary),
              findings = COALESCE($6::jsonb, findings),
              attack_paths = COALESCE($7::jsonb, attack_paths),
              ai_analysis = COALESCE($8::jsonb, ai_analysis),
              warnings = COALESCE($9::jsonb, warnings),
              started_at = COALESCE($10, started_at),
              completed_at = COALESCE($11, completed_at),
              updated_at = NOW()
        WHERE id = $1
      RETURNING id,
                workspace_id,
                organization_id,
                verification_id,
                requested_by_user_id,
                target_url,
                hostname,
                status,
                requested_modules,
                guardrails,
                redacted_auth_profiles,
                baseline,
                plan,
                summary,
                findings,
                attack_paths,
                ai_analysis,
                warnings,
                started_at,
                completed_at,
                created_at,
                updated_at`,
      [
        runId,
        input.status,
        input.baseline ? JSON.stringify(input.baseline) : null,
        input.plan ? JSON.stringify(input.plan) : null,
        input.summary ? JSON.stringify(input.summary) : null,
        input.findings ? JSON.stringify(input.findings) : null,
        input.attackPaths ? JSON.stringify(input.attackPaths) : null,
        input.aiAnalysis ? JSON.stringify(input.aiAnalysis) : null,
        input.warnings ? JSON.stringify(input.warnings) : null,
        input.startedAt ?? null,
        input.completedAt ?? null
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: Record<string, unknown>): AuthorizedSecurityTestRunEntity {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      organizationId: row.organization_id as string,
      verificationId: row.verification_id as string,
      requestedByUserId: (row.requested_by_user_id as string | null) ?? undefined,
      targetUrl: row.target_url as string,
      hostname: row.hostname as string,
      status: row.status as AuthorizedSecurityTestRunStatus,
      requestedModules:
        ((row.requested_modules as AuthorizedSecurityTestModule[] | null) ?? []) as
          AuthorizedSecurityTestModule[],
      guardrails: ((row.guardrails as string[] | null) ?? []) as string[],
      redactedAuthProfiles:
        ((row.redacted_auth_profiles as AuthorizedSecurityTestAuthProfileSummary[] | null) ??
          []) as AuthorizedSecurityTestAuthProfileSummary[],
      baseline: ((row.baseline as AuthorizedSecurityBaseline | null) ??
        EMPTY_BASELINE) as AuthorizedSecurityBaseline,
      plan: ((row.plan as AuthorizedSecurityPlanStep[] | null) ?? []) as
        AuthorizedSecurityPlanStep[],
      summary: ((row.summary as AuthorizedSecurityTestSummary | null) ??
        EMPTY_SUMMARY) as AuthorizedSecurityTestSummary,
      findings: ((row.findings as AuthorizedSecurityFinding[] | null) ?? []) as
        AuthorizedSecurityFinding[],
      attackPaths:
        ((row.attack_paths as AuthorizedSecurityAttackPath[] | null) ?? []) as
          AuthorizedSecurityAttackPath[],
      aiAnalysis:
        ((row.ai_analysis as AuthorizedSecurityAiAnalysis | null) ?? EMPTY_AI_ANALYSIS) as
          AuthorizedSecurityAiAnalysis,
      warnings: ((row.warnings as string[] | null) ?? []) as string[],
      startedAt:
        row.started_at instanceof Date
          ? row.started_at.toISOString()
          : ((row.started_at as string | null) ?? undefined),
      completedAt:
        row.completed_at instanceof Date
          ? row.completed_at.toISOString()
          : ((row.completed_at as string | null) ?? undefined),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }
}
