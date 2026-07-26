import { randomUUID } from "crypto";

import { MobileScanResultEntity } from "../entities/mobile-scan-result.entity";
import { BaseRepository } from "./base.repository";
import { ParsedReport } from "../../services/mobile/mobile-scan.types";

interface CreateMobileScanResultInput {
  workspaceId: string;
  report: ParsedReport;
}

interface MobileScanResultRow {
  id: string;
  workspace_id: string;
  app_name: string;
  package_name: string;
  version: string;
  target_sdk: number;
  min_sdk: number;
  file_size: number | string;
  security_score: number;
  permissions: MobileScanResultEntity["permissions"];
  vulnerabilities: MobileScanResultEntity["vulnerabilities"];
  trackers: string[];
  summary: MobileScanResultEntity["summary"];
  recommendations: string[];
  scan_date: string;
  created_at: string;
  updated_at: string;
}

export class MobileScanResultRepository extends BaseRepository {
  async create(
    input: CreateMobileScanResultInput
  ): Promise<MobileScanResultEntity> {
    const entity: MobileScanResultEntity = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      appName: input.report.appName,
      packageName: input.report.packageName,
      version: input.report.version,
      targetSdk: input.report.targetSdk,
      minSdk: input.report.minSdk,
      fileSize: input.report.fileSize,
      securityScore: input.report.securityScore,
      permissions: input.report.permissions,
      vulnerabilities: input.report.vulnerabilities,
      trackers: input.report.trackers,
      summary: input.report.summary,
      recommendations: input.report.recommendations,
      scanDate: input.report.scanDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.pool.query(
      `INSERT INTO mobile_scan_results (
         id,
         workspace_id,
         app_name,
         package_name,
         version,
         target_sdk,
         min_sdk,
         file_size,
         security_score,
         permissions,
         vulnerabilities,
         trackers,
         summary,
         recommendations,
         scan_date,
         created_at,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17
       )`,
      [
        entity.id,
        entity.workspaceId,
        entity.appName,
        entity.packageName,
        entity.version,
        entity.targetSdk,
        entity.minSdk,
        entity.fileSize,
        entity.securityScore,
        JSON.stringify(entity.permissions),
        JSON.stringify(entity.vulnerabilities),
        JSON.stringify(entity.trackers),
        JSON.stringify(entity.summary),
        JSON.stringify(entity.recommendations),
        entity.scanDate,
        entity.createdAt,
        entity.updatedAt
      ]
    );

    return entity;
  }

  async listByWorkspace(
    workspaceId: string,
    limit = 25
  ): Promise<MobileScanResultEntity[]> {
    const { rows } = await this.pool.query<MobileScanResultRow>(
      `SELECT *
         FROM mobile_scan_results
        WHERE workspace_id = $1
        ORDER BY scan_date DESC
        LIMIT $2`,
      [workspaceId, Math.max(1, Math.min(100, Math.trunc(limit)))]
    );

    return rows.map((row) => this.mapRow(row));
  }

  async findById(
    workspaceId: string,
    scanId: string
  ): Promise<MobileScanResultEntity | null> {
    const { rows } = await this.pool.query<MobileScanResultRow>(
      `SELECT *
         FROM mobile_scan_results
        WHERE workspace_id = $1
          AND id = $2
        LIMIT 1`,
      [workspaceId, scanId]
    );

    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async deleteById(workspaceId: string, scanId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `DELETE FROM mobile_scan_results
        WHERE workspace_id = $1
          AND id = $2`,
      [workspaceId, scanId]
    );

    return Boolean(rowCount);
  }

  private mapRow(row: MobileScanResultRow): MobileScanResultEntity {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      appName: row.app_name,
      packageName: row.package_name,
      version: row.version,
      targetSdk: row.target_sdk,
      minSdk: row.min_sdk,
      fileSize: Number(row.file_size),
      securityScore: row.security_score,
      permissions: row.permissions,
      vulnerabilities: row.vulnerabilities,
      trackers: row.trackers,
      summary: row.summary,
      recommendations: row.recommendations,
      scanDate: row.scan_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
