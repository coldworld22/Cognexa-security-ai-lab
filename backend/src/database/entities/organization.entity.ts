import { BaseEntity } from "./base.entity";

export interface OrganizationEntity extends BaseEntity {
  name: string;
  slug: string;
  billingEmail?: string;
  billingCustomerId?: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  metadata: Record<string, unknown>;
  createdByUserId?: string;
}
