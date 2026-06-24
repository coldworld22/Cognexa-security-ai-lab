import { Request, Response } from "express";

import { CanonicalUserRole } from "../../authorization/authorization.types";
import { AdminService } from "../../services/admin/admin.service";
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
    const verification = await this.admin.startDomainVerification(request.auth!, {
      target: request.body.target as string,
      method: request.body.method as
        | "dns_txt"
        | "http_file"
        | "html_meta"
        | undefined,
      devModeBypass: request.body.devModeBypass as boolean | undefined
    });
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
    const report = await this.admin.runAuthorizedSecurityTest(request.auth!, {
      verificationId: request.body.verificationId as string | undefined,
      url: request.body.url as string,
      maxPages: request.body.maxPages as number | undefined,
      maxRequests: request.body.maxRequests as number | undefined,
      devModeBypass: request.body.devModeBypass as boolean | undefined,
      modules: request.body.modules as
        | Array<
            | "sql_injection"
            | "xss"
            | "authentication"
            | "authorization"
            | "api_security"
            | "waf"
            | "session_management"
          >
        | undefined,
      authProfiles: request.body.authProfiles as
        | Array<{
            name: string;
            role: "anonymous" | "low_privilege" | "high_privilege";
            headers?: Record<string, string>;
            cookies?: Record<string, string>;
          }>
        | undefined
    });
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
}
