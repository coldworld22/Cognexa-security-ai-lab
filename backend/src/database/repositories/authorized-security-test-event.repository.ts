import { randomUUID } from "crypto";

import { AuthorizedSecurityTestEventEntity } from "../entities/authorized-security-test-event.entity";
import { BaseRepository } from "./base.repository";
import {
  AuthorizedSecurityFindingSeverity,
  AuthorizedSecurityTestEventType,
  AuthorizedSecurityTestModule
} from "../../services/authorized-testing/authorized-security-testing.types";

interface CreateAuthorizedSecurityTestEventInput {
  runId: string;
  eventType: AuthorizedSecurityTestEventType;
  severity: AuthorizedSecurityFindingSeverity;
  category?: AuthorizedSecurityTestModule;
  message: string;
  metadata?: Record<string, unknown>;
}

export class AuthorizedSecurityTestEventRepository extends BaseRepository {
  async create(
    input: CreateAuthorizedSecurityTestEventInput
  ): Promise<AuthorizedSecurityTestEventEntity> {
    const entity: AuthorizedSecurityTestEventEntity = {
      id: randomUUID(),
      runId: input.runId,
      eventType: input.eventType,
      severity: input.severity,
      category: input.category,
      message: input.message,
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO authorized_security_test_events (
         id,
         run_id,
         event_type,
         severity,
         category,
         message,
         metadata,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        entity.id,
        entity.runId,
        entity.eventType,
        entity.severity,
        entity.category ?? null,
        entity.message,
        JSON.stringify(entity.metadata),
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return entity;
  }

  async listByRun(runId: string): Promise<AuthorizedSecurityTestEventEntity[]> {
    const result = await this.pool.query(
      `SELECT id,
              run_id,
              event_type,
              severity,
              category,
              message,
              metadata,
              created_at,
              updated_at
         FROM authorized_security_test_events
        WHERE run_id = $1
        ORDER BY created_at ASC`,
      [runId]
    );

    return result.rows.map((row) => ({
      id: row.id as string,
      runId: row.run_id as string,
      eventType: row.event_type as AuthorizedSecurityTestEventType,
      severity: row.severity as AuthorizedSecurityFindingSeverity,
      category: (row.category as AuthorizedSecurityTestModule | null) ?? undefined,
      message: row.message as string,
      metadata: ((row.metadata as Record<string, unknown> | null) ?? {}) as Record<
        string,
        unknown
      >,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString()
    }));
  }
}
