import { randomUUID } from "crypto";

import { AuthorizedDomainVerificationEntity } from "../entities/authorized-domain-verification.entity";
import { BaseRepository } from "./base.repository";
import {
  DomainOwnershipVerificationMethod,
  DomainOwnershipVerificationStatus
} from "../../services/authorized-testing/authorized-security-testing.types";

interface CreateAuthorizedDomainVerificationInput {
  workspaceId: string;
  organizationId: string;
  requestedByUserId?: string;
  hostname: string;
  method: DomainOwnershipVerificationMethod;
  status: DomainOwnershipVerificationStatus;
  challengeToken: string;
  challengeDetails: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  expiresAt: string;
}

interface UpdateAuthorizedDomainVerificationInput {
  status: DomainOwnershipVerificationStatus;
  evidence?: Record<string, unknown>;
  challengeDetails?: Record<string, unknown>;
  lastCheckedAt?: string;
  verifiedAt?: string;
  expiresAt?: string;
}

export class AuthorizedDomainVerificationRepository extends BaseRepository {
  async create(
    input: CreateAuthorizedDomainVerificationInput
  ): Promise<AuthorizedDomainVerificationEntity> {
    const entity: AuthorizedDomainVerificationEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      organizationId: input.organizationId,
      requestedByUserId: input.requestedByUserId,
      hostname: input.hostname,
      method: input.method,
      status: input.status,
      challengeToken: input.challengeToken,
      challengeDetails: input.challengeDetails,
      evidence: input.evidence ?? {},
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO authorized_domain_verifications (
         id,
         workspace_id,
         organization_id,
         requested_by_user_id,
         hostname,
         method,
         status,
         challenge_token,
         challenge_details,
         evidence,
         expires_at,
         created_at,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13
       )`,
      [
        entity.id,
        entity.workspaceId,
        entity.organizationId,
        entity.requestedByUserId ?? null,
        entity.hostname,
        entity.method,
        entity.status,
        entity.challengeToken,
        JSON.stringify(entity.challengeDetails),
        JSON.stringify(entity.evidence),
        entity.expiresAt,
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return entity;
  }

  async findById(id: string): Promise<AuthorizedDomainVerificationEntity | null> {
    const result = await this.pool.query(
      `SELECT id,
              workspace_id,
              organization_id,
              requested_by_user_id,
              hostname,
              method,
              status,
              challenge_token,
              challenge_details,
              evidence,
              last_checked_at,
              verified_at,
              expires_at,
              created_at,
              updated_at
         FROM authorized_domain_verifications
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
    limit = 25
  ): Promise<AuthorizedDomainVerificationEntity[]> {
    const result = await this.pool.query(
      `SELECT id,
              workspace_id,
              organization_id,
              requested_by_user_id,
              hostname,
              method,
              status,
              challenge_token,
              challenge_details,
              evidence,
              last_checked_at,
              verified_at,
              expires_at,
              created_at,
              updated_at
         FROM authorized_domain_verifications
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [workspaceId, limit]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async updateStatus(
    verificationId: string,
    input: UpdateAuthorizedDomainVerificationInput
  ): Promise<AuthorizedDomainVerificationEntity> {
    const result = await this.pool.query(
      `UPDATE authorized_domain_verifications
          SET status = $2,
              evidence = COALESCE($3::jsonb, evidence),
              challenge_details = COALESCE($4::jsonb, challenge_details),
              last_checked_at = COALESCE($5, last_checked_at),
              verified_at = COALESCE($6, verified_at),
              expires_at = COALESCE($7, expires_at),
              updated_at = NOW()
        WHERE id = $1
      RETURNING id,
                workspace_id,
                organization_id,
                requested_by_user_id,
                hostname,
                method,
                status,
                challenge_token,
                challenge_details,
                evidence,
                last_checked_at,
                verified_at,
                expires_at,
                created_at,
                updated_at`,
      [
        verificationId,
        input.status,
        input.evidence ? JSON.stringify(input.evidence) : null,
        input.challengeDetails ? JSON.stringify(input.challengeDetails) : null,
        input.lastCheckedAt ?? null,
        input.verifiedAt ?? null,
        input.expiresAt ?? null
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: Record<string, unknown>): AuthorizedDomainVerificationEntity {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      organizationId: row.organization_id as string,
      requestedByUserId: (row.requested_by_user_id as string | null) ?? undefined,
      hostname: row.hostname as string,
      method: row.method as DomainOwnershipVerificationMethod,
      status: row.status as DomainOwnershipVerificationStatus,
      challengeToken: row.challenge_token as string,
      challengeDetails:
        ((row.challenge_details as Record<string, unknown> | null) ?? {}) as Record<
          string,
          unknown
        >,
      evidence: ((row.evidence as Record<string, unknown> | null) ?? {}) as Record<
        string,
        unknown
      >,
      lastCheckedAt:
        row.last_checked_at instanceof Date
          ? row.last_checked_at.toISOString()
          : ((row.last_checked_at as string | null) ?? undefined),
      verifiedAt:
        row.verified_at instanceof Date
          ? row.verified_at.toISOString()
          : ((row.verified_at as string | null) ?? undefined),
      expiresAt:
        row.expires_at instanceof Date
          ? row.expires_at.toISOString()
          : (row.expires_at as string),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }
}
