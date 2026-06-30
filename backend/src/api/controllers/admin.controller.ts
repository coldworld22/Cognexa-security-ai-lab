import { Request, Response } from "express";

import { CanonicalUserRole } from "../../authorization/authorization.types";
import { AdminService } from "../../services/admin/admin.service";
import type { AuthorizedSecurityTestModule } from "../../services/authorized-testing/authorized-security-testing.types";
import { ToolExecutionService } from "../../services/tool-execution/tool-execution.service";

export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly tools: ToolExecutionService
  ) {}

  dashboard = async (request: Request, response: Response) => {
    const dashboard = await this.admin.getDashboard(request.auth!);
    response.json({
      ...dashboard,
      availableTools: await this.tools.listTools(request.auth!)
    });
  };

  listUsers = async (request: Request, response: Response) => {
    const { limit } = request.query as unknown as { limit?: number };
    const users = await this.admin.listUsers(request.auth!, limit);
    response.json({ users });
  };

  updateUserRole = async (request: Request, response: Response) => {
    const user = await this.admin.updateUserRole(
      request.auth!,
      request.params.userId as string,
      request.body.role as CanonicalUserRole
    );
    response.json({ user });
  };

  scanNetwork = async (request: Request, response: Response) => {
    const scan = await this.admin.scanNetwork(request.auth!);
    response.json(scan);
  };

  startNetworkScan = async (request: Request, response: Response) => {
    const result = await this.admin.startNetworkScan(request.auth!);
    response.status(202).json(result);
  };

  resolveNetworkNames = async (request: Request, response: Response) => {
    const result = await this.admin.resolveNetworkNames(request.auth!);
    response.status(202).json(result);
  };

  scanWebsite = async (request: Request, response: Response) => {
    const scan = await this.admin.scanWebsite(request.auth!, {
      url: request.body.url as string,
      maxPages: request.body.maxPages as number | undefined
    });
    response.json(scan);
  };

  runSecurityReview = async (request: Request, response: Response) => {
    const review = await this.admin.runSecurityReview(request.auth!, {
      url: request.body.url as string,
      maxPages: request.body.maxPages as number | undefined
    });
    response.json(review);
  };

  startDomainVerification = async (request: Request, response: Response) => {
    const verificationInput = {
      target: request.body.target as string,
      method: request.body.method as
        | "dns_txt"
        | "http_file"
        | "html_meta"
        | undefined,
      ...(request.body.devModeBypass !== undefined
        ? {
            devModeBypass: request.body.devModeBypass as boolean
          }
        : {})
    };
    const verification = await this.admin.startDomainVerification(
      request.auth!,
      verificationInput
    );
    response.status(201).json({ verification });
  };

  checkDomainVerification = async (request: Request, response: Response) => {
    const verification = await this.admin.checkDomainVerification(
      request.auth!,
      request.params.verificationId as string,
      request.body.devModeBypass as boolean | undefined
    );
    response.json({ verification });
  };

  listDomainVerifications = async (request: Request, response: Response) => {
    const { limit } = request.query as unknown as { limit?: number };
    const verifications = await this.admin.listDomainVerifications(
      request.auth!,
      limit
    );
    response.json({ verifications });
  };

  getAuthorizedTestingDevMode = async (request: Request, response: Response) => {
    const devMode = await this.admin.getAuthorizedTestingDevMode(request.auth!);
    response.json({ devMode });
  };

  runAuthorizedSecurityTest = async (request: Request, response: Response) => {
    const runInput = {
      verificationId: request.body.verificationId as string | undefined,
      url: request.body.url as string,
      maxPages: request.body.maxPages as number | undefined,
      maxRequests: request.body.maxRequests as number | undefined,
      modules: request.body.modules as AuthorizedSecurityTestModule[] | undefined,
      authProfiles: request.body.authProfiles as
        | Array<{
            name: string;
            role: "anonymous" | "low_privilege" | "high_privilege";
            headers?: Record<string, string>;
            cookies?: Record<string, string>;
          }>
        | undefined,
      authEndpointDescriptors: request.body.authEndpointDescriptors as
        | Array<{
            type: "auth_api";
            name: string;
            entryUrl: string;
            endpoint: string;
            method?: "POST";
            contentType?: string;
            fields: string[];
            tokenFields?: string[];
            stagingOnly?: boolean;
            productionMode?: "passive_only";
          }>
        | undefined,
      manualFormValidation: request.body.manualFormValidation as
        | {
            rateLimitPerMinute?: number;
            credentialLabels?: string[];
            notes?: string;
          }
        | undefined,
      ...(request.body.devModeBypass !== undefined
        ? {
            devModeBypass: request.body.devModeBypass as boolean
          }
        : {})
    };
    const report = await this.admin.runAuthorizedSecurityTest(
      request.auth!,
      runInput
    );
    response.status(201).json(report);
  };

  getAuthorizedSecurityTestRun = async (request: Request, response: Response) => {
    const report = await this.admin.getAuthorizedSecurityTestRun(
      request.auth!,
      request.params.runId as string
    );
    response.json(report);
  };

  listAuthorizedSecurityTestRuns = async (request: Request, response: Response) => {
    const { limit } = request.query as unknown as { limit?: number };
    const runs = await this.admin.listAuthorizedSecurityTestRuns(
      request.auth!,
      limit
    );
    response.json({ runs });
  };

  getPrivateModeConfig = async (request: Request, response: Response) => {
    const config = await this.admin.getPrivateModeConfig(request.auth!);
    response.json({ config });
  };

  updatePrivateModeConfig = async (request: Request, response: Response) => {
    const config = await this.admin.updatePrivateModeConfig(request.auth!, request.body);
    response.json({ config });
  };

  activatePrivateMode = async (request: Request, response: Response) => {
    const session = await this.admin.activatePrivateMode(request.auth!, request.body);
    response.status(201).json({ session });
  };

  deactivatePrivateMode = async (request: Request, response: Response) => {
    await this.admin.deactivatePrivateMode(
      request.auth!,
      request.body.sessionId as string | undefined
    );
    response.status(204).send();
  };

  getPrivateModeSession = async (request: Request, response: Response) => {
    response.json(await this.admin.getPrivateModeSessionState(request.auth!));
  };

  verifyPrivateMode = async (request: Request, response: Response) => {
    const verification = await this.admin.verifyPrivateMode(request.auth!);
    response.json({ verification });
  };

  leakTestPrivateMode = async (request: Request, response: Response) => {
    const leakTest = await this.admin.runPrivateModeLeakTest(request.auth!);
    response.json({ leakTest });
  };

  rotatePrivateModeCircuit = async (request: Request, response: Response) => {
    const circuit = await this.admin.rotatePrivateModeCircuit(
      request.auth!,
      request.body.sessionId as string | undefined
    );
    response.json({ circuit });
  };

  listPrivateModeExitLogs = async (request: Request, response: Response) => {
    const { limit } = request.query as unknown as { limit?: number };
    const logs = await this.admin.listPrivateModeExitLogs(request.auth!, limit);
    response.json({ logs });
  };
}
