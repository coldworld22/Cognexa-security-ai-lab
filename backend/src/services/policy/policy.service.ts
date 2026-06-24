import { URL } from "url";

import {
  AccessContext,
  CanonicalUserRole
} from "../../authorization/authorization.types";
import {
  PolicyAssignmentEntity,
  PolicyEntity,
  PolicyRuleEntity
} from "../../database/entities/policy.entity";
import { PolicyAuditLogRepository } from "../../database/repositories/policy-audit-log.repository";
import { PolicyRepository } from "../../database/repositories/policy.repository";
import { AppError } from "../../utils/app-error";
import { canManageWorkspace } from "../../workspaces/workspace.types";
import {
  DEFAULT_CATEGORY_DECISIONS,
  DEFAULT_WORKSPACE_POLICY_MODE,
  highestDecision,
  POLICY_DECISION_PRIORITY,
  POLICY_SCOPE_PRIORITY,
  PolicyCategory,
  PolicyDecision,
  PolicyEvaluationMatch,
  PolicyEvaluationRequest,
  PolicyEvaluationResult,
  PolicyMode,
  PolicyScopeType,
  PolicyUpsertInput
} from "../../policy/policy.types";

interface PolicyTestInput extends Omit<PolicyEvaluationRequest, "actor" | "dryRun"> {
  actor: AccessContext;
}

export class PolicyService {
  constructor(
    private readonly policies: PolicyRepository,
    private readonly auditLogs: PolicyAuditLogRepository
  ) {}

  async ensureWorkspaceDefaults(
    workspaceId: string,
    createdByUserId?: string
  ): Promise<void> {
    await this.policies.ensureWorkspaceModeAssignment(
      workspaceId,
      createdByUserId,
      DEFAULT_WORKSPACE_POLICY_MODE
    );
  }

  async listPolicies(actor: AccessContext): Promise<{
    policies: PolicyEntity[];
    currentWorkspaceMode: PolicyMode;
    availableModes: PolicyMode[];
  }> {
    this.assertPolicyManagementAccess(actor);
    await this.ensureWorkspaceDefaults(actor.workspaceId, actor.userId);

    const policies = await this.policies.listPolicies({
      includeSystem: true
    });
    const modeAssignment = await this.policies.getActiveWorkspaceModeAssignment(
      actor.workspaceId
    );

    return {
      policies,
      currentWorkspaceMode:
        modeAssignment?.mode ?? DEFAULT_WORKSPACE_POLICY_MODE,
      availableModes: ["open", "strict", "enterprise", "research", "custom"]
    };
  }

  async createPolicy(
    actor: AccessContext,
    input: PolicyUpsertInput
  ): Promise<PolicyEntity> {
    this.assertPolicyManagementAccess(actor, input.assignments);
    return this.policies.createPolicy({
      ...input,
      createdByUserId: actor.userId,
      mode: input.mode ?? "custom"
    });
  }

  async updatePolicy(
    actor: AccessContext,
    policyId: string,
    input: PolicyUpsertInput
  ): Promise<PolicyEntity> {
    const existing = await this.policies.findById(policyId);
    if (!existing) {
      throw new AppError("Policy not found", 404);
    }

    if (existing.isSystem) {
      throw new AppError("System policies cannot be edited directly", 403);
    }

    this.assertPolicyManagementAccess(actor, input.assignments);
    return this.policies.updatePolicy(policyId, input);
  }

  async deletePolicy(actor: AccessContext, policyId: string): Promise<void> {
    const existing = await this.policies.findById(policyId);
    if (!existing) {
      throw new AppError("Policy not found", 404);
    }

    if (existing.isSystem) {
      throw new AppError("System policies cannot be deleted", 403);
    }

    this.assertPolicyManagementAccess(actor, existing.assignments.map((assignment) => ({
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId
    })));

    await this.policies.deletePolicy(policyId);
  }

  async setWorkspaceMode(
    actor: AccessContext,
    mode: PolicyMode,
    customPolicyId?: string
  ): Promise<PolicyMode> {
    this.assertPolicyManagementAccess(actor);

    let policyId = customPolicyId;
    if (mode !== "custom") {
      const systemPolicy = await this.policies.findSystemPolicyByMode(mode);
      if (!systemPolicy) {
        throw new AppError(`System policy '${mode}' not found`, 404);
      }

      policyId = systemPolicy.id;
    } else {
      if (!policyId) {
        throw new AppError("Custom mode requires a policyId", 400);
      }

      const policy = await this.policies.findById(policyId);
      if (!policy) {
        throw new AppError("Custom policy not found", 404);
      }

      if (policy.isSystem) {
        throw new AppError("Custom mode must reference a non-system policy", 400);
      }
    }

    await this.policies.replaceWorkspaceModeAssignment(
      actor.workspaceId,
      policyId!,
      mode,
      actor.userId
    );

    return mode;
  }

  async evaluatePolicy(
    request: PolicyEvaluationRequest,
    options: {
      enforce?: boolean;
    } = {}
  ): Promise<PolicyEvaluationResult> {
    await this.ensureWorkspaceDefaults(request.actor.workspaceId);
    const policies = await this.policies.listApplicablePolicies({
      organizationId: request.actor.organizationId,
      workspaceId: request.actor.workspaceId,
      userId: request.actor.userId
    });

    const modeAssignment = await this.policies.getActiveWorkspaceModeAssignment(
      request.actor.workspaceId
    );
    const matchedRules = this.collectMatchedRules(policies, request);
    const categoryDecisions = this.resolveCategoryDecisions(
      request.categories,
      matchedRules,
      modeAssignment?.mode ?? DEFAULT_WORKSPACE_POLICY_MODE
    );
    const decision = highestDecision(
      categoryDecisions.map((match) => match.decision)
    );
    const result: PolicyEvaluationResult = {
      decision,
      blocking: decision === "deny" || decision === "require_approval",
      requiresApproval: decision === "require_approval",
      warnings: categoryDecisions
        .filter((match) => match.decision === "warn")
        .map((match) => match.description ?? `${match.category} triggered a warning rule.`),
      matchedRules: categoryDecisions,
      mode: modeAssignment?.mode ?? DEFAULT_WORKSPACE_POLICY_MODE,
      evaluatedAt: new Date().toISOString()
    };

    if (!request.dryRun) {
      await this.recordEvaluation(request, result);
    }

    const shouldEnforce = options.enforce ?? true;

    if (shouldEnforce && result.decision === "deny") {
      throw new AppError("Request denied by AI policy", 403, result);
    }

    if (shouldEnforce && result.decision === "require_approval") {
      throw new AppError("Request requires administrator approval", 403, result);
    }

    return result;
  }

  async testPolicy(input: PolicyTestInput): Promise<PolicyEvaluationResult> {
    this.assertPolicyManagementAccess(input.actor);
    return this.evaluatePolicy(
      {
        ...input,
        dryRun: false
      },
      {
        enforce: false
      }
    );
  }

  async listAuditLogs(actor: AccessContext, limit = 100) {
    this.assertPolicyManagementAccess(actor);
    return this.auditLogs.list({
      workspaceId: actor.workspaceId,
      limit
    });
  }

  private assertPolicyManagementAccess(
    actor: AccessContext,
    assignments: Array<{
      scopeType: PolicyScopeType;
      scopeId?: string;
    }> = []
  ): void {
    const isWorkspaceAdmin = canManageWorkspace(actor.workspaceRole);
    const isPlatformAdmin = actor.role === "super_admin" || actor.role === "admin" || actor.role === "manager";

    if (!isPlatformAdmin && !isWorkspaceAdmin) {
      throw new AppError("Policy management requires workspace or platform administration", 403);
    }

    for (const assignment of assignments) {
      if (assignment.scopeType === "global" && actor.role !== "super_admin" && actor.role !== "admin") {
        throw new AppError("Global policy changes require platform administration", 403);
      }

      if (
        assignment.scopeType === "organization" &&
        assignment.scopeId &&
        assignment.scopeId !== actor.organizationId &&
        actor.role !== "super_admin"
      ) {
        throw new AppError("You can only manage policies for your current organization", 403);
      }

      if (
        assignment.scopeType === "workspace" &&
        assignment.scopeId &&
        assignment.scopeId !== actor.workspaceId &&
        actor.role !== "super_admin"
      ) {
        throw new AppError("You can only manage policies for your current workspace", 403);
      }

      if (
        assignment.scopeType === "user" &&
        !isPlatformAdmin &&
        !isWorkspaceAdmin
      ) {
        throw new AppError("User policy changes require an administrator", 403);
      }
    }
  }

  private collectMatchedRules(
    policies: PolicyEntity[],
    request: PolicyEvaluationRequest
  ): PolicyEvaluationMatch[] {
    const matches: PolicyEvaluationMatch[] = [];

    for (const policy of policies) {
      const relevantAssignments = policy.assignments.filter(
        (assignment) =>
          assignment.isActive &&
          this.assignmentApplies(assignment, request.actor)
      );

      if (relevantAssignments.length === 0 || !policy.isActive) {
        continue;
      }

      for (const assignment of relevantAssignments) {
        for (const rule of policy.rules) {
          if (!rule.enabled) {
            continue;
          }

          if (!request.categories.includes(rule.category)) {
            continue;
          }

          if (!this.ruleMatches(rule, request)) {
            continue;
          }

          matches.push({
            policyId: policy.id,
            policyName: policy.name,
            ruleId: rule.id,
            assignmentId: assignment.id,
            category: rule.category,
            decision: rule.decision,
            scopeType: assignment.scopeType,
            scopeId: assignment.scopeId,
            mode: assignment.mode ?? policy.mode,
            description: rule.description ?? policy.description,
            priority: rule.priority + assignment.priority
          });
        }
      }
    }

    return matches;
  }

  private resolveCategoryDecisions(
    categories: PolicyCategory[],
    matches: PolicyEvaluationMatch[],
    fallbackMode: PolicyMode
  ): PolicyEvaluationMatch[] {
    return categories.map((category) => {
      const categoryMatches = matches
        .filter((match) => match.category === category)
        .sort((left, right) => {
          const scopeOrder =
            POLICY_SCOPE_PRIORITY[right.scopeType] - POLICY_SCOPE_PRIORITY[left.scopeType];
          if (scopeOrder !== 0) {
            return scopeOrder;
          }

          const decisionOrder =
            POLICY_DECISION_PRIORITY[right.decision] - POLICY_DECISION_PRIORITY[left.decision];
          if (decisionOrder !== 0) {
            return decisionOrder;
          }

          return right.priority - left.priority;
        });

      if (categoryMatches.length > 0) {
        return categoryMatches[0]!;
      }

      return {
        policyId: "default",
        policyName: "Built-in Defaults",
        category,
        decision: DEFAULT_CATEGORY_DECISIONS[category],
        scopeType: "global",
        mode: fallbackMode,
        description: `Default ${DEFAULT_CATEGORY_DECISIONS[category]} policy for ${category}.`,
        priority: 0
      };
    });
  }

  private assignmentApplies(
    assignment: PolicyAssignmentEntity,
    actor: AccessContext
  ): boolean {
    switch (assignment.scopeType) {
      case "global":
        return true;
      case "organization":
        return assignment.scopeId === actor.organizationId;
      case "workspace":
        return assignment.scopeId === actor.workspaceId;
      case "user":
        return assignment.scopeId === actor.userId;
      default:
        return false;
    }
  }

  private ruleMatches(
    rule: PolicyRuleEntity,
    request: PolicyEvaluationRequest
  ): boolean {
    if (
      rule.roleScopes.length > 0 &&
      !rule.roleScopes.includes(request.actor.role as CanonicalUserRole)
    ) {
      return false;
    }

    if (
      rule.workspaceRoleScopes.length > 0 &&
      !rule.workspaceRoleScopes.includes(request.actor.workspaceRole)
    ) {
      return false;
    }

    if (
      rule.toolNames.length > 0 &&
      (!request.toolName || !rule.toolNames.includes(request.toolName))
    ) {
      return false;
    }

    if (
      rule.modelPatterns.length > 0 &&
      (!request.model || !rule.modelPatterns.some((pattern) => this.matchesPattern(request.model!, pattern)))
    ) {
      return false;
    }

    const conditions = rule.conditions;
    if (conditions.contentPatterns && conditions.contentPatterns.length > 0) {
      const content = request.content?.toLowerCase() ?? "";
      const hasPattern = conditions.contentPatterns.some((pattern) => {
        try {
          return new RegExp(pattern, "i").test(content);
        } catch {
          return content.includes(pattern.toLowerCase());
        }
      });
      if (!hasPattern) {
        return false;
      }
    }

    if (
      conditions.fileExtensions &&
      conditions.fileExtensions.length > 0
    ) {
      const fileName = request.fileName?.toLowerCase() ?? "";
      const hasExtension = conditions.fileExtensions.some((extension) =>
        fileName.endsWith(extension.toLowerCase())
      );
      if (!hasExtension) {
        return false;
      }
    }

    if (
      typeof conditions.maxFileSizeBytes === "number" &&
      typeof request.fileSizeBytes === "number" &&
      request.fileSizeBytes > conditions.maxFileSizeBytes
    ) {
      return false;
    }

    const urlHost = this.extractUrlHost(request.url);
    if (
      conditions.urlHosts &&
      conditions.urlHosts.length > 0 &&
      (!urlHost || !conditions.urlHosts.includes(urlHost))
    ) {
      return false;
    }

    if (
      conditions.urlNotHosts &&
      conditions.urlNotHosts.length > 0 &&
      urlHost &&
      conditions.urlNotHosts.includes(urlHost)
    ) {
      return false;
    }

    if (conditions.metadataEquals) {
      for (const [key, expectedValue] of Object.entries(conditions.metadataEquals)) {
        if (request.metadata?.[key] !== expectedValue) {
          return false;
        }
      }
    }

    return true;
  }

  private async recordEvaluation(
    request: PolicyEvaluationRequest,
    result: PolicyEvaluationResult
  ): Promise<void> {
    await Promise.all(
      result.matchedRules.map((match) =>
        this.auditLogs.create({
          userId: request.actor.userId,
          workspaceId: request.actor.workspaceId,
          organizationId: request.actor.organizationId,
          action: request.action,
          category: match.category,
          toolName: request.toolName,
          model: request.model,
          provider: request.provider,
          decision: match.decision,
          mode: match.mode,
          policyId: match.policyId === "default" ? undefined : match.policyId,
          matchedRuleId: match.ruleId,
          scopeType: match.scopeType,
          scopeId: match.scopeId,
          requestContext: {
            fileName: request.fileName,
            mimeType: request.mimeType,
            fileSizeBytes: request.fileSizeBytes,
            sqlPreview: request.sql?.slice(0, 240),
            contentPreview: request.content?.slice(0, 320),
            metadata: request.metadata ?? {}
          }
        })
      )
    );
  }

  private matchesPattern(value: string, pattern: string): boolean {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`, "i").test(value);
  }

  private extractUrlHost(url?: string): string | null {
    if (!url) {
      return null;
    }

    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}
