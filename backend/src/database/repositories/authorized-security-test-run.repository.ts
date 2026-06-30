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
  passiveWarnings: [],
  declaredAuthEndpoints: []
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeManualFormValidation(
  value: unknown
): AuthorizedSecurityBaseline["manualFormValidation"] {
  if (!isRecord(value)) {
    return undefined;
  }

  const credentialLabels = asStringArray(value.credentialLabels).filter(Boolean);
  const rateLimitPerMinute = Math.max(1, Math.min(60, asNumber(value.rateLimitPerMinute, 5)));
  const notes = asString(value.notes).trim();

  return {
    rateLimitPerMinute,
    credentialLabels,
    ...(notes ? { notes } : {})
  };
}

function normalizeBaseline(value: unknown): AuthorizedSecurityBaseline {
  if (!isRecord(value)) {
    return EMPTY_BASELINE;
  }

  return {
    ...EMPTY_BASELINE,
    ...value,
    requestedUrl: asString(value.requestedUrl, EMPTY_BASELINE.requestedUrl),
    finalUrl: asString(value.finalUrl, EMPTY_BASELINE.finalUrl),
    hostname: asString(value.hostname, EMPTY_BASELINE.hostname),
    pagesScanned: asNumber(value.pagesScanned, EMPTY_BASELINE.pagesScanned),
    maxPages: asNumber(value.maxPages, EMPTY_BASELINE.maxPages),
    securityScore: asNumber(value.securityScore, EMPTY_BASELINE.securityScore),
    grade:
      value.grade === "A" ||
      value.grade === "B" ||
      value.grade === "C" ||
      value.grade === "D" ||
      value.grade === "F"
        ? value.grade
        : EMPTY_BASELINE.grade,
    passiveWarnings: asStringArray(value.passiveWarnings),
    declaredAuthEndpoints: asArray<
      AuthorizedSecurityBaseline["declaredAuthEndpoints"][number]
    >(value.declaredAuthEndpoints),
    manualFormValidation: normalizeManualFormValidation(value.manualFormValidation)
  };
}

function normalizeFindingCounts(
  value: unknown
): AuthorizedSecurityTestSummary["findingCounts"] {
  if (!isRecord(value)) {
    return EMPTY_SUMMARY.findingCounts;
  }

  return {
    info: asNumber(value.info, EMPTY_SUMMARY.findingCounts.info),
    low: asNumber(value.low, EMPTY_SUMMARY.findingCounts.low),
    medium: asNumber(value.medium, EMPTY_SUMMARY.findingCounts.medium),
    high: asNumber(value.high, EMPTY_SUMMARY.findingCounts.high)
  };
}

function normalizeCampaignStory(
  value: unknown
): AuthorizedSecurityTestSummary["campaignStory"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    ...value,
    headline: asString(value.headline),
    narrative: asString(value.narrative),
    sections: asArray<
      NonNullable<AuthorizedSecurityTestSummary["campaignStory"]>["sections"][number]
    >(value.sections).map((section) => ({
      ...section,
      evidence: isRecord(section) ? asStringArray(section.evidence) : []
    })),
    chainHighlights: asStringArray(value.chainHighlights)
  };
}

function normalizeAdaptation(
  value: unknown
): AuthorizedSecurityTestSummary["adaptation"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    ...value,
    followUpExecuted: asArray<AuthorizedSecurityTestModule>(value.followUpExecuted),
    decisions: asArray<
      NonNullable<AuthorizedSecurityTestSummary["adaptation"]>["decisions"][number]
    >(value.decisions).map((decision) => ({
      ...decision,
      triggerFindingIds: isRecord(decision)
        ? asStringArray(decision.triggerFindingIds)
        : [],
      triggerCategories: isRecord(decision)
        ? asArray<AuthorizedSecurityTestModule>(decision.triggerCategories)
        : []
    }))
  };
}

function normalizeSummary(value: unknown): AuthorizedSecurityTestSummary {
  if (!isRecord(value)) {
    return EMPTY_SUMMARY;
  }

  const executionInsights = isRecord(value.executionInsights)
    ? {
        moduleConcurrency: asNumber(value.executionInsights.moduleConcurrency),
        probeCacheHits: asNumber(value.executionInsights.probeCacheHits),
        probeCacheMisses: asNumber(value.executionInsights.probeCacheMisses),
        adaptiveBackoffCount: asNumber(value.executionInsights.adaptiveBackoffCount),
        rateLimitedResponses: asNumber(value.executionInsights.rateLimitedResponses),
        networkRequestsSent: asNumber(value.executionInsights.networkRequestsSent)
      }
    : undefined;

  const adaptation = normalizeAdaptation(value.adaptation);
  const campaignStory = normalizeCampaignStory(value.campaignStory);

  return {
    ...EMPTY_SUMMARY,
    ...value,
    headline: asString(value.headline, EMPTY_SUMMARY.headline),
    planSource:
      value.planSource === "ai" || value.planSource === "deterministic"
        ? value.planSource
        : EMPTY_SUMMARY.planSource,
    requestBudget: asNumber(value.requestBudget, EMPTY_SUMMARY.requestBudget),
    requestsSent: asNumber(value.requestsSent, EMPTY_SUMMARY.requestsSent),
    modulesExecuted: asArray<AuthorizedSecurityTestModule>(value.modulesExecuted),
    prioritizedModules: Array.isArray(value.prioritizedModules)
      ? (value.prioritizedModules as AuthorizedSecurityTestSummary["prioritizedModules"])
      : undefined,
    executionInsights,
    adaptation,
    campaignStory,
    findingCounts: normalizeFindingCounts(value.findingCounts),
    recommendedActions: asStringArray(value.recommendedActions),
    reversible: asBoolean(value.reversible, EMPTY_SUMMARY.reversible)
  };
}

function normalizeAiAnalysis(value: unknown): AuthorizedSecurityAiAnalysis {
  if (!isRecord(value)) {
    return EMPTY_AI_ANALYSIS;
  }

  return {
    ...EMPTY_AI_ANALYSIS,
    ...value,
    status:
      value.status === "ready" || value.status === "unavailable"
        ? value.status
        : EMPTY_AI_ANALYSIS.status,
    provider:
      typeof value.provider === "string" ? value.provider : undefined,
    model: typeof value.model === "string" ? value.model : undefined,
    headline:
      typeof value.headline === "string" ? value.headline : undefined,
    executiveSummary:
      typeof value.executiveSummary === "string"
        ? value.executiveSummary
        : undefined,
    predictions: asArray<AuthorizedSecurityAiAnalysis["predictions"][number]>(
      value.predictions
    ).map((prediction) => ({
      ...prediction,
      indicators: isRecord(prediction) ? asStringArray(prediction.indicators) : []
    })),
    nextSteps: asStringArray(value.nextSteps),
    unavailableReason:
      typeof value.unavailableReason === "string"
        ? value.unavailableReason
        : undefined
  };
}

function normalizeAuthProfileSummaries(
  value: unknown
): AuthorizedSecurityTestAuthProfileSummary[] {
  return asArray<AuthorizedSecurityTestAuthProfileSummary>(value).map((profile) => ({
    ...profile,
    headerNames: isRecord(profile) ? asStringArray(profile.headerNames) : [],
    cookieNames: isRecord(profile) ? asStringArray(profile.cookieNames) : []
  }));
}

function normalizePlan(value: unknown): AuthorizedSecurityPlanStep[] {
  return asArray<AuthorizedSecurityPlanStep>(value).map((step) => ({
    ...step,
    stopConditions: isRecord(step) ? asStringArray(step.stopConditions) : []
  }));
}

function normalizeFindings(value: unknown): AuthorizedSecurityFinding[] {
  return asArray<AuthorizedSecurityFinding>(value).map((finding) => ({
    ...finding,
    evidence: isRecord(finding) ? asStringArray(finding.evidence) : [],
    supportingEventIds: isRecord(finding)
      ? asStringArray(finding.supportingEventIds)
      : []
  }));
}

function normalizeAttackPaths(value: unknown): AuthorizedSecurityAttackPath[] {
  return asArray<AuthorizedSecurityAttackPath>(value).map((attackPath) => ({
    ...attackPath,
    supportingFindingIds: isRecord(attackPath)
      ? asStringArray(attackPath.supportingFindingIds)
      : []
  }));
}

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
        asArray<AuthorizedSecurityTestModule>(row.requested_modules),
      guardrails: asStringArray(row.guardrails),
      redactedAuthProfiles:
        normalizeAuthProfileSummaries(row.redacted_auth_profiles),
      baseline: normalizeBaseline(row.baseline),
      plan: normalizePlan(row.plan),
      summary: normalizeSummary(row.summary),
      findings: normalizeFindings(row.findings),
      attackPaths: normalizeAttackPaths(row.attack_paths),
      aiAnalysis: normalizeAiAnalysis(row.ai_analysis),
      warnings: asStringArray(row.warnings),
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
