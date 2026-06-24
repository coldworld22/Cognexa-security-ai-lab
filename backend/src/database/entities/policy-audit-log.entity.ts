import { BaseEntity } from "./base.entity";
import {
  PolicyCategory,
  PolicyDecision,
  PolicyMode,
  PolicyScopeType
} from "../../policy/policy.types";

export interface PolicyAuditLogEntity extends BaseEntity {
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
  requestContext: Record<string, unknown>;
}
