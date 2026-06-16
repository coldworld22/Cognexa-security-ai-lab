import { randomUUID } from "crypto";

import { BaseRepository } from "./base.repository";
import { WorkspaceEntity } from "../entities/workspace.entity";

interface CreateWorkspaceInput {
  organizationId: string;
  name: string;
  slug: string;
  isPersonal?: boolean;
  metadata?: Record<string, unknown>;
  createdByUserId?: string;
}

export class WorkspaceRepository extends BaseRepository {
  async create(input: CreateWorkspaceInput): Promise<WorkspaceEntity> {
    const workspace: WorkspaceEntity = {
      id: randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      slug: input.slug,
      isPersonal: input.isPersonal ?? false,
      metadata: input.metadata ?? {},
      createdByUserId: input.createdByUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO workspaces (
         id,
         organization_id,
         name,
         slug,
         is_personal,
         metadata,
         created_by_user_id,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
      [
        workspace.id,
        workspace.organizationId,
        workspace.name,
        workspace.slug,
        workspace.isPersonal,
        JSON.stringify(workspace.metadata),
        workspace.createdByUserId ?? null,
        workspace.createdAt,
        workspace.updatedAt
      ]
    );

    return workspace;
  }
}
