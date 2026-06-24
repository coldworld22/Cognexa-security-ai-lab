import { BaseEntity } from "./base.entity";
import {
  DomainOwnershipVerificationMethod,
  DomainOwnershipVerificationStatus
} from "../../services/authorized-testing/authorized-security-testing.types";

export interface AuthorizedDomainVerificationEntity extends BaseEntity {
  workspaceId: string;
  organizationId: string;
  requestedByUserId?: string;
  hostname: string;
  method: DomainOwnershipVerificationMethod;
  status: DomainOwnershipVerificationStatus;
  challengeToken: string;
  challengeDetails: Record<string, unknown>;
  evidence: Record<string, unknown>;
  lastCheckedAt?: string;
  verifiedAt?: string;
  expiresAt: string;
}
