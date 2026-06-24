import { BaseEntity } from "./base.entity";
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

export interface AuthorizedSecurityTestRunEntity extends BaseEntity {
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
  baseline: AuthorizedSecurityBaseline;
  plan: AuthorizedSecurityPlanStep[];
  summary: AuthorizedSecurityTestSummary;
  findings: AuthorizedSecurityFinding[];
  attackPaths: AuthorizedSecurityAttackPath[];
  aiAnalysis: AuthorizedSecurityAiAnalysis;
  warnings: string[];
  startedAt?: string;
  completedAt?: string;
}
