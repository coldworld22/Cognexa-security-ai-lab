import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { WorkspaceMemberEntity } from "../entities/workspace-member.entity";
import { WorkspaceRole, WorkspaceSummary } from "../../workspaces/workspace.types";

interface UpsertWorkspaceMemberInput {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  invitedByUserId?: string;
}

export class WorkspaceMemberRepository extends BaseRepository {
  private mapRow(row: Record<string, unknown>): WorkspaceMemberEntity {
    return {
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      userId: row.user_id as string,
      role: row.role as WorkspaceRole,
      invitedByUserId: (row.invited_by_user_id as string | null) ?? undefined,
      joinedAt: (row.joined_at as Date).toISOString(),
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    };
  }

  async upsert(input: UpsertWorkspaceMemberInput): Promise<WorkspaceMemberEntity> {
    const entity: WorkspaceMemberEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      invitedByUserId: input.invitedByUserId,
      joinedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const result = await this.pool.query(
      `INSERT INTO workspace_members (
         id,
         workspace_id,
         user_id,
         role,
         invited_by_user_id,
         joined_at,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (workspace_id, user_id)
       DO UPDATE SET
         role = EXCLUDED.role,
         invited_by_user_id = COALESCE(EXCLUDED.invited_by_user_id, workspace_members.invited_by_user_id),
         updated_at = EXCLUDED.updated_at
       RETURNING id, workspace_id, user_id, role, invited_by_user_id, joined_at, created_at, updated_at`,
      [
        entity.id,
        entity.workspaceId,
        entity.userId,
        entity.role,
        entity.invitedByUserId ?? null,
        entity.joinedAt,
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return this.mapRow(result.rows[0]!);
  }

  async findByWorkspaceAndUser(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMemberEntity | null> {
    const result = await this.pool.query(
      `SELECT id, workspace_id, user_id, role, invited_by_user_id, joined_at, created_at, updated_at
       FROM workspace_members
       WHERE workspace_id = $1 AND user_id = $2
       LIMIT 1`,
      [workspaceId, userId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]!);
  }

  async hasWorkspaceMemberWithEmail(
    workspaceId: string,
    email: string
  ): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1
       FROM workspace_members wm
       INNER JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1 AND LOWER(u.email) = LOWER($2)
       LIMIT 1`,
      [workspaceId, email]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async listWorkspaceSummariesForUser(userId: string): Promise<WorkspaceSummary[]> {
    const result = await this.pool.query(
      `SELECT
         w.id,
         w.organization_id,
         o.name AS organization_name,
         w.name,
         w.slug,
         w.is_personal,
         wm.role,
         w.created_at,
         w.updated_at
       FROM workspace_members wm
       INNER JOIN workspaces w ON w.id = wm.workspace_id
       INNER JOIN organizations o ON o.id = w.organization_id
       WHERE wm.user_id = $1
       ORDER BY w.is_personal DESC, w.created_at ASC`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      organizationId: row.organization_id as string,
      organizationName: row.organization_name as string,
      name: row.name as string,
      slug: row.slug as string,
      role: row.role as WorkspaceRole,
      isPersonal: row.is_personal as boolean,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    }));
  }
}
