import { CanonicalUserRole, AccessContext } from "../authorization/authorization.types";
import { WorkspaceRole } from "../workspaces/workspace.types";

export const POLICY_SCOPE_TYPES = [
  "global",
  "organization",
  "workspace",
  "user"
] as const;

export const POLICY_ASSIGNMENT_TYPES = [
  "baseline",
  "mode",
  "overlay"
] as const;

export const POLICY_MODES = [
  "open",
  "strict",
  "enterprise",
  "research",
  "custom"
] as const;

export const POLICY_CATEGORIES = [
  "code_generation",
  "security_research",
  "vulnerability_analysis",
  "document_access",
  "external_url_access",
  "agent_execution",
  "tool_usage",
  "file_uploads",
  "database_queries",
  "command_execution"
] as const;

export const POLICY_DECISIONS = [
  "allow",
  "warn",
  "require_approval",
  "deny"
] as const;

export type PolicyScopeType = (typeof POLICY_SCOPE_TYPES)[number];
export type PolicyAssignmentType = (typeof POLICY_ASSIGNMENT_TYPES)[number];
export type PolicyMode = (typeof POLICY_MODES)[number];
export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];
export type PolicyDecision = (typeof POLICY_DECISIONS)[number];

export interface PolicyRuleConditions {
  contentPatterns?: string[];
  urlHosts?: string[];
  urlNotHosts?: string[];
  fileExtensions?: string[];
  maxFileSizeBytes?: number;
  metadataEquals?: Record<string, string | number | boolean>;
}

export interface PolicyEvaluationRequest {
  actor: AccessContext;
  action: string;
  categories: PolicyCategory[];
  toolName?: string;
  model?: string;
  provider?: string;
  content?: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  sql?: string;
  metadata?: Record<string, unknown>;
  dryRun?: boolean;
}

export interface PolicyRuleDefinitionInput {
  id?: string;
  category: PolicyCategory;
  decision: PolicyDecision;
  enabled?: boolean;
  priority?: number;
  description?: string;
  toolNames?: string[];
  roleScopes?: CanonicalUserRole[];
  workspaceRoleScopes?: WorkspaceRole[];
  modelPatterns?: string[];
  conditions?: PolicyRuleConditions;
}

export interface PolicyAssignmentInput {
  id?: string;
  scopeType: PolicyScopeType;
  scopeId?: string;
  assignmentType?: PolicyAssignmentType;
  mode?: PolicyMode;
  priority?: number;
  isActive?: boolean;
}

export interface PolicyUpsertInput {
  name: string;
  description?: string;
  mode?: PolicyMode;
  isActive?: boolean;
  rules: PolicyRuleDefinitionInput[];
  assignments: PolicyAssignmentInput[];
  metadata?: Record<string, unknown>;
}

export interface PolicyEvaluationMatch {
  policyId: string;
  policyName: string;
  ruleId?: string;
  assignmentId?: string;
  category: PolicyCategory;
  decision: PolicyDecision;
  scopeType: PolicyScopeType;
  scopeId?: string;
  mode: PolicyMode;
  description?: string;
  priority: number;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  blocking: boolean;
  requiresApproval: boolean;
  warnings: string[];
  matchedRules: PolicyEvaluationMatch[];
  mode: PolicyMode;
  evaluatedAt: string;
}

export const POLICY_DECISION_PRIORITY: Record<PolicyDecision, number> = {
  allow: 0,
  warn: 1,
  require_approval: 2,
  deny: 3
};

export const POLICY_SCOPE_PRIORITY: Record<PolicyScopeType, number> = {
  global: 0,
  organization: 1,
  workspace: 2,
  user: 3
};

export const DEFAULT_CATEGORY_DECISIONS: Record<PolicyCategory, PolicyDecision> = {
  code_generation: "allow",
  security_research: "warn",
  vulnerability_analysis: "require_approval",
  document_access: "allow",
  external_url_access: "warn",
  agent_execution: "require_approval",
  tool_usage: "allow",
  file_uploads: "warn",
  database_queries: "deny",
  command_execution: "deny"
};

export const DEFAULT_WORKSPACE_POLICY_MODE: PolicyMode = "open";

export function highestDecision(
  decisions: PolicyDecision[]
): PolicyDecision {
  return decisions.reduce<PolicyDecision>((current, candidate) => {
    if (POLICY_DECISION_PRIORITY[candidate] > POLICY_DECISION_PRIORITY[current]) {
      return candidate;
    }

    return current;
  }, "allow");
}

export function inferPolicyCategoriesFromText(input: string): PolicyCategory[] {
  const normalized = input.toLowerCase();
  const categories = new Set<PolicyCategory>();

  if (/(write|generate|create|implement|refactor|debug|fix).*(code|script|function|api|component|query)/.test(normalized) ||
      /(code|script|function|class|query|sql|regex|algorithm)/.test(normalized)) {
    categories.add("code_generation");
  }

  if (/(security research|pentest|red team|malware|exploit|payload|shellcode|phishing|recon|enumeration)/.test(normalized)) {
    categories.add("security_research");
  }

  if (/(vulnerability|cve-|cwe-|exploitability|triage|analy[sz]e.*vuln|scan results)/.test(normalized)) {
    categories.add("vulnerability_analysis");
  }

  if (/(document|pdf|file|report|runbook|playbook|readme|attachment)/.test(normalized)) {
    categories.add("document_access");
  }

  if (/https?:\/\//.test(normalized) || /\b(url|website|web page|link)\b/.test(normalized)) {
    categories.add("external_url_access");
  }

  return Array.from(categories);
}
