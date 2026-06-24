import { BaseEntity } from "./base.entity";
import {
  AuthorizedSecurityFindingSeverity,
  AuthorizedSecurityTestEventType,
  AuthorizedSecurityTestModule
} from "../../services/authorized-testing/authorized-security-testing.types";

export interface AuthorizedSecurityTestEventEntity extends BaseEntity {
  runId: string;
  eventType: AuthorizedSecurityTestEventType;
  severity: AuthorizedSecurityFindingSeverity;
  category?: AuthorizedSecurityTestModule;
  message: string;
  metadata: Record<string, unknown>;
}
