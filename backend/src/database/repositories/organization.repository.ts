import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { OrganizationEntity } from "../entities/organization.entity";

interface CreateOrganizationInput {
  name: string;
  slug: string;
  billingEmail?: string;
  billingCustomerId?: string;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  metadata?: Record<string, unknown>;
  createdByUserId?: string;
}

export class OrganizationRepository extends BaseRepository {
  async create(input: CreateOrganizationInput): Promise<OrganizationEntity> {
    const organization: OrganizationEntity = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      billingEmail: input.billingEmail,
      billingCustomerId: input.billingCustomerId,
      subscriptionPlan: input.subscriptionPlan ?? "free",
      subscriptionStatus: input.subscriptionStatus ?? "trialing",
      metadata: input.metadata ?? {},
      createdByUserId: input.createdByUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO organizations (
         id,
         name,
         slug,
         billing_email,
         billing_customer_id,
         subscription_plan,
         subscription_status,
         metadata,
         created_by_user_id,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
      [
        organization.id,
        organization.name,
        organization.slug,
        organization.billingEmail ?? null,
        organization.billingCustomerId ?? null,
        organization.subscriptionPlan,
        organization.subscriptionStatus,
        JSON.stringify(organization.metadata),
        organization.createdByUserId ?? null,
        organization.createdAt,
        organization.updatedAt
      ]
    );

    return organization;
  }
}
