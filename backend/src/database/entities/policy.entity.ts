import { BaseEntity } from "./base.entity";
import {
  PolicyAssignmentType,
  PolicyCategory,
  PolicyDecision,
  PolicyMode,
  PolicyScopeType,
  PolicyRuleConditions
} from "../../policy/policy.types";
import { CanonicalUserRole } from "../../authorization/authorization.types";
import { WorkspaceRole } from "../../workspaces/workspace.types";

export interface PolicyRuleEntity extends BaseEntity {
  policyId: string;
  category: PolicyCategory;
  decision: PolicyDecision;
  enabled: boolean;
  priority: number;
  description?: string;
  toolNames: string[];
  roleScopes: CanonicalUserRole[];
  workspaceRoleScopes: WorkspaceRole[];
  modelPatterns: string[];
  conditions: PolicyRuleConditions;
}

export interface PolicyAssignmentEntity extends BaseEntity {
  policyId: string;
  scopeType: PolicyScopeType;
  scopeId?: string;
  assignmentType: PolicyAssignmentType;
  mode?: PolicyMode;
  priority: number;
  isActive: boolean;
}

export interface PolicyEntity extends BaseEntity {
  name: string;
  description: string;
  mode: PolicyMode;
  isSystem: boolean;
  isActive: boolean;
  createdByUserId?: string;
  metadata: Record<string, unknown>;
  rules: PolicyRuleEntity[];
  assignments: PolicyAssignmentEntity[];
}
