import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { WorkspaceInvitationEntity } from "../entities/workspace-invitation.entity";
import {
  WorkspaceInvitationSummary,
  WorkspaceRole
} from "../../workspaces/workspace.types";

interface CreateOrReplaceInvitationInput {
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  tokenHash: string;
  invitedByUserId?: string;
  expiresAt: string;
}

export class WorkspaceInvitationRepository extends BaseRepository {
  private mapRow(row: Record<string, unknown>): WorkspaceInvitationEntity {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      email: row.email as string,
      role: row.role as WorkspaceRole,
      tokenHash: row.token_hash as string,
      invitedByUserId: (row.invited_by_user_id as string | null) ?? undefined,
      expiresAt: (row.expires_at as Date).toISOString(),
      acceptedAt: row.accepted_at ? (row.accepted_at as Date).toISOString() : undefined,
      acceptedByUserId: (row.accepted_by_user_id as string | null) ?? undefined,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }

  async createOrReplacePending(
    input: CreateOrReplaceInvitationInput
  ): Promise<WorkspaceInvitationEntity> {
    const existing = await this.findPendingByWorkspaceAndEmail(
      input.workspaceId,
      input.email
    );
    const now = new Date().toISOString();

    if (existing) {
      const result = await this.pool.query(
        `UPDATE workspace_invitations
         SET role = $2,
             token_hash = $3,
             invited_by_user_id = $4,
             expires_at = $5,
             updated_at = $6
         WHERE id = $1
         RETURNING
           id,
           workspace_id,
           email,
           role,
           token_hash,
           invited_by_user_id,
           expires_at,
           accepted_at,
           accepted_by_user_id,
           created_at,
           updated_at`,
        [
          existing.id,
          input.role,
          input.tokenHash,
          input.invitedByUserId ?? null,
          input.expiresAt,
          now
        ]
      );

      return this.mapRow(result.rows[0]!);
    }

    const entity: WorkspaceInvitationEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      email: input.email,
      role: input.role,
      tokenHash: input.tokenHash,
      invitedByUserId: input.invitedByUserId,
      expiresAt: input.expiresAt,
      createdAt: now,
      updatedAt: now
    };

    const result = await this.pool.query(
      `INSERT INTO workspace_invitations (
         id,
         workspace_id,
         email,
         role,
         token_hash,
         invited_by_user_id,
         expires_at,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING
         id,
         workspace_id,
         email,
         role,
         token_hash,
         invited_by_user_id,
         expires_at,
         accepted_at,
         accepted_by_user_id,
         created_at,
         updated_at`,
      [
        entity.id,
        entity.workspaceId,
        entity.email,
        entity.role,
        entity.tokenHash,
        entity.invitedByUserId ?? null,
        entity.expiresAt,
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return this.mapRow(result.rows[0]!);
  }

  async findById(id: string): Promise<WorkspaceInvitationEntity | null> {
    const result = await this.pool.query(
      `SELECT
         id,
         workspace_id,
         email,
         role,
         token_hash,
         invited_by_user_id,
         expires_at,
         accepted_at,
         accepted_by_user_id,
         created_at,
         updated_at
       FROM workspace_invitations
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]!);
  }

  async findPendingByWorkspaceAndEmail(
    workspaceId: string,
    email: string
  ): Promise<WorkspaceInvitationEntity | null> {
    const result = await this.pool.query(
      `SELECT
         id,
         workspace_id,
         email,
         role,
         token_hash,
         invited_by_user_id,
         expires_at,
         accepted_at,
         accepted_by_user_id,
         created_at,
         updated_at
       FROM workspace_invitations
       WHERE workspace_id = $1
         AND LOWER(email) = LOWER($2)
         AND accepted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [workspaceId, email]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]!);
  }

  async listPendingForEmail(email: string): Promise<WorkspaceInvitationSummary[]> {
    const result = await this.pool.query(
      `SELECT
         wi.id,
         wi.workspace_id,
         w.name AS workspace_name,
         o.name AS organization_name,
         wi.email,
         wi.role,
         wi.expires_at,
         wi.created_at,
         wi.updated_at
       FROM workspace_invitations wi
       INNER JOIN workspaces w ON w.id = wi.workspace_id
       INNER JOIN organizations o ON o.id = w.organization_id
       WHERE LOWER(wi.email) = LOWER($1)
         AND wi.accepted_at IS NULL
         AND wi.expires_at > NOW()
       ORDER BY wi.created_at DESC`,
      [email]
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      workspaceName: row.workspace_name as string,
      organizationName: row.organization_name as string,
      email: row.email as string,
      role: row.role as WorkspaceRole,
      expiresAt: (row.expires_at as Date).toISOString(),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    }));
  }

  async markAccepted(
    id: string,
    acceptedByUserId: string
  ): Promise<WorkspaceInvitationEntity> {
    const result = await this.pool.query(
      `UPDATE workspace_invitations
       SET accepted_at = NOW(),
           accepted_by_user_id = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         workspace_id,
         email,
         role,
         token_hash,
         invited_by_user_id,
         expires_at,
         accepted_at,
         accepted_by_user_id,
         created_at,
         updated_at`,
      [id, acceptedByUserId]
    );

    if (result.rowCount === 0) {
      throw new Error(`Workspace invitation ${id} not found`);
    }

    return this.mapRow(result.rows[0]!);
  }
}
