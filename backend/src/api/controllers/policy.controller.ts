import { Request, Response } from "express";

import { PolicyService } from "../../services/policy/policy.service";
import { AccessContext } from "../../authorization/authorization.types";
import { WorkspaceRole } from "../../workspaces/workspace.types";
import { PolicyUpsertInput } from "../../policy/policy.types";

export class PolicyController {
  constructor(private readonly policies: PolicyService) {}

  list = async (request: Request, response: Response) => {
    const result = await this.policies.listPolicies(request.auth!);
    response.json(result);
  };

  create = async (request: Request, response: Response) => {
    const policy = await this.policies.createPolicy(
      request.auth!,
      request.body as PolicyUpsertInput
    );
    response.status(201).json({ policy });
  };

  update = async (request: Request, response: Response) => {
    const policy = await this.policies.updatePolicy(
      request.auth!,
      request.params.policyId as string,
      request.body as PolicyUpsertInput
    );
    response.json({ policy });
  };

  delete = async (request: Request, response: Response) => {
    await this.policies.deletePolicy(
      request.auth!,
      request.params.policyId as string
    );
    response.status(204).send();
  };

  evaluate = async (request: Request, response: Response) => {
    const actor = this.buildTestActor(request);
    const result = await this.policies.testPolicy({
      actor,
      action: request.body.action as string,
      categories: request.body.categories,
      toolName: request.body.toolName as string | undefined,
      model: request.body.model as string | undefined,
      provider: request.body.provider as string | undefined,
      content: request.body.content as string | undefined,
      url: request.body.url as string | undefined,
      fileName: request.body.fileName as string | undefined,
      mimeType: request.body.mimeType as string | undefined,
      fileSizeBytes: request.body.fileSizeBytes as number | undefined,
      sql: request.body.sql as string | undefined,
      metadata: request.body.metadata as Record<string, unknown> | undefined
    });
    response.json(result);
  };

  listAuditLogs = async (request: Request, response: Response) => {
    const limit = Number(request.query.limit ?? 100);
    const logs = await this.policies.listAuditLogs(request.auth!, limit);
    response.json({ logs });
  };

  setWorkspaceMode = async (request: Request, response: Response) => {
    const mode = await this.policies.setWorkspaceMode(
      request.auth!,
      request.body.mode,
      request.body.policyId
    );
    response.json({ mode });
  };

  private buildTestActor(request: Request): AccessContext {
    return {
      ...request.auth!,
      role: (request.body.roleOverride as AccessContext["role"] | undefined) ?? request.auth!.role,
      workspaceRole:
        (request.body.workspaceRoleOverride as WorkspaceRole | undefined) ??
        request.auth!.workspaceRole
    };
  }
}
