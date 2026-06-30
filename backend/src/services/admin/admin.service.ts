import { AccessContext, CanonicalUserRole } from "../../authorization/authorization.types";
import { ConversationRepository } from "../../database/repositories/conversation.repository";
import { FileRepository } from "../../database/repositories/file.repository";
import { MessageRepository } from "../../database/repositories/message.repository";
import { TaskRepository } from "../../database/repositories/task.repository";
import { ToolExecutionRepository } from "../../database/repositories/tool-execution.repository";
import { UserRepository } from "../../database/repositories/user.repository";
import { AuthorizationService } from "../authorization/authorization.service";
import { PolicyService } from "../policy/policy.service";
import {
  EndpointMonitorService,
  NetworkScanResult
} from "../endpoints/endpoint-monitor.service";
import { HealthService } from "../health/health.service";
import { AppError } from "../../utils/app-error";
import {
  SecurityReviewRequest,
  SecurityReviewResult,
  SecurityReviewService
} from "../security-review/security-review.service";
import {
  WebsiteScanRequest,
  WebsiteScanResult,
  WebsiteScannerService
} from "../website-scanner/website-scanner.service";
import {
  AuthorizedSecurityTestAuthEndpointDescriptorInput,
  AuthorizedSecurityManualFormValidationInput,
  AuthorizedTestingDevModeStatus,
  AuthorizedSecurityTestAuthProfile,
  AuthorizedSecurityTestReport,
  AuthorizedSecurityTestRunSummary,
  DomainOwnershipVerificationSummary,
  RunAuthorizedSecurityTestRequest,
  StartDomainOwnershipVerificationRequest
} from "../authorized-testing/authorized-security-testing.types";
import { AuthorizedSecurityTestingService } from "../authorized-testing/authorized-security-testing.service";
import { CloakingService } from "../private-mode/cloaking.service";
import {
  CircuitStatus,
  CloakingConfig,
  CloakingSession,
  CloakingVerificationResult,
  ExitLog,
  LeakTestResult
} from "../private-mode/private-mode.types";
import {
  PenetrationTestOrchestrator,
  PenetrationTestOrchestratorFactory
} from "../penetration-testing/penetration-test-orchestrator.service";
import { TaskEntity } from "../../database/entities/task.entity";

interface PersistedPenetrationTestAuditEntry {
  id: string;
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface PersistedPenetrationTestRecord {
  runId: string;
  taskId?: string;
  agentId?: string;
  context?: Record<string, unknown>;
  auditTrail?: PersistedPenetrationTestAuditEntry[];
  report?: Record<string, unknown>;
}

export interface StartAdvancedPenetrationTestRequest {
  target: string;
  verificationId: string;
  authProfiles?: AuthorizedSecurityTestAuthProfile[];
  authEndpointDescriptors?: AuthorizedSecurityTestAuthEndpointDescriptorInput[];
  manualFormValidation?: AuthorizedSecurityManualFormValidationInput;
  maxPages?: number;
  maxRequests?: number;
  conversationId?: string;
  runId?: string;
}

export interface AdvancedPenetrationTestRunSummary {
  runId: string;
  taskId?: string;
  agentId?: string;
  target: string;
  status: TaskEntity["status"];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  vulnerabilities: number;
  attackChains: number;
  finalSummary?: string;
}

export interface AdvancedPenetrationTestRunDetail {
  runId: string;
  taskId?: string;
  agentId?: string;
  target: string;
  status: TaskEntity["status"];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  finalSummary?: string;
  context: Record<string, unknown>;
  auditTrail: PersistedPenetrationTestAuditEntry[];
  report?: Record<string, unknown>;
}

export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  role: CanonicalUserRole;
  preferences: Record<string, unknown>;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrivateModeSessionState {
  session: CloakingSession | null;
  circuit: CircuitStatus | null;
  verification: CloakingVerificationResult | null;
  routeVerified: boolean;
  verificationError: string | null;
}

export class AdminService {
  constructor(
    private readonly users: UserRepository,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly files: FileRepository,
    private readonly toolExecutions: ToolExecutionRepository,
    private readonly tasks: TaskRepository,
    private readonly health: HealthService,
    private readonly authorization: AuthorizationService,
    private readonly policy: PolicyService,
    private readonly endpoints: EndpointMonitorService,
    private readonly websiteScanner: WebsiteScannerService,
    private readonly securityReview: SecurityReviewService,
    private readonly authorizedTesting: AuthorizedSecurityTestingService,
    private readonly privateMode: CloakingService,
    private readonly penetrationTesting: PenetrationTestOrchestratorFactory
  ) {}

  async getDashboard(actor: AccessContext) {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.dashboard",
      action: "view_admin_dashboard",
      reason: "Admin dashboard requires 'admin_dashboard' permission"
    });

    const [
      users,
      conversations,
      conversationsLast7Days,
      messages,
      files,
      toolExecutions,
      tasks,
      modelUsage,
      health
    ] = await Promise.all([
      this.users.count(),
      this.conversations.count(),
      this.conversations.countCreatedSince("7 days"),
      this.messages.count(),
      this.files.getSummary(),
      this.toolExecutions.getSummary(),
      this.tasks.count(),
      this.conversations.getUsageByProvider(),
      this.health.getSnapshot()
    ]);

    return {
      metrics: {
        users,
        conversations: {
          total: conversations,
          last7Days: conversationsLast7Days
        },
        messages,
        files,
        toolExecutions,
        tasks,
        localModel: {
          status: health.dependencies.localModel.status,
          endpoint: health.dependencies.localModel.endpoint,
          latencyMs: health.dependencies.localModel.latencyMs ?? null,
          providerCount: health.dependencies.llmProviders.filter(
            (provider) => provider.models.length > 0
          ).length
        }
      },
      modelUsage,
      health
    };
  }

  async listUsers(actor: AccessContext, limit = 50): Promise<ManagedUser[]> {
    await this.authorization.assertPermission(actor, "user_management", {
      layer: "service",
      resource: "admin.users",
      action: "list_users",
      reason: "User management requires 'user_management' permission"
    });

    const users = await this.users.listUsers(limit);
    return users.map((user) => this.toManagedUser(user));
  }

  async updateUserRole(
    actor: AccessContext,
    userId: string,
    role: CanonicalUserRole
  ): Promise<ManagedUser> {
    await this.authorization.assertPermission(actor, "user_management", {
      layer: "service",
      resource: `admin.users.${userId}.role`,
      action: "update_user_role",
      reason: "User management requires 'user_management' permission"
    });

    if (actor.userId === userId) {
      throw new AppError("You cannot change your own role", 400);
    }

    const existingUser = await this.users.findById(userId);
    if (!existingUser) {
      throw new AppError("User not found", 404);
    }

    const normalizedExistingRole =
      existingUser.role === "user" ? "developer" : existingUser.role;

    if (actor.role !== "super_admin") {
      if (normalizedExistingRole === "super_admin") {
        throw new AppError("Only Super Admin can manage Super Admin accounts", 403);
      }

      if (role === "super_admin") {
        throw new AppError("Only Super Admin can assign the Super Admin role", 403);
      }
    }

    const updatedUser = await this.users.updateRole(userId, role);
    await this.authorization.invalidateUserCaches(userId, [
      existingUser.role,
      role
    ]);

    return this.toManagedUser(updatedUser);
  }

  async scanNetwork(actor: AccessContext): Promise<NetworkScanResult> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.network.scan",
      action: "scan_network",
      reason: "Network scanning requires 'admin_dashboard' permission"
    });

    return this.endpoints.getCurrentNetworkSnapshot();
  }

  async startNetworkScan(actor: AccessContext): Promise<{
    job: Awaited<ReturnType<EndpointMonitorService["startNetworkScan"]>>;
  }> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.network.scan",
      action: "start_network_scan",
      reason: "Network scanning requires 'admin_dashboard' permission"
    });

    return {
      job: await this.endpoints.startNetworkScan()
    };
  }

  async resolveNetworkNames(actor: AccessContext): Promise<{
    job: Awaited<ReturnType<EndpointMonitorService["startNetworkScan"]>>;
  }> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.network.resolve_names",
      action: "resolve_network_names",
      reason: "Name resolution requires 'admin_dashboard' permission"
    });

    return {
      job: await this.endpoints.startNetworkScan({
        forceNameResolution: true
      })
    };
  }

  async scanWebsite(
    actor: AccessContext,
    input: WebsiteScanRequest
  ): Promise<WebsiteScanResult> {
    await this.assertPrivateModeActiveForSecurityWork(
      actor,
      "admin.website.scan",
      "scan_website"
    );
    return this.websiteScanner.scanWebsite(actor, input);
  }

  async runSecurityReview(
    actor: AccessContext,
    input: SecurityReviewRequest
  ): Promise<SecurityReviewResult> {
    await this.assertPrivateModeActiveForSecurityWork(
      actor,
      "admin.security-review-lab",
      "run_security_review"
    );
    return this.securityReview.runReview(actor, input);
  }

  async startDomainVerification(
    actor: AccessContext,
    input: StartDomainOwnershipVerificationRequest
  ): Promise<DomainOwnershipVerificationSummary> {
    await this.assertPrivateModeActiveForSecurityWork(
      actor,
      "admin.authorized-testing.domain-verification",
      "start_domain_verification"
    );
    return this.authorizedTesting.startDomainVerification(actor, input);
  }

  async checkDomainVerification(
    actor: AccessContext,
    verificationId: string,
    devModeBypass = false
  ): Promise<DomainOwnershipVerificationSummary> {
    await this.assertPrivateModeActiveForSecurityWork(
      actor,
      `admin.authorized-testing.verifications.${verificationId}`,
      "check_domain_verification"
    );
    return this.authorizedTesting.checkDomainVerification(
      actor,
      verificationId,
      devModeBypass
    );
  }

  async listDomainVerifications(
    actor: AccessContext,
    limit = 25
  ): Promise<DomainOwnershipVerificationSummary[]> {
    return this.authorizedTesting.listDomainVerifications(actor, limit);
  }

  async getAuthorizedTestingDevMode(
    actor: AccessContext
  ): Promise<AuthorizedTestingDevModeStatus> {
    return this.authorizedTesting.getVerificationBypassStatus(actor);
  }

  async runAuthorizedSecurityTest(
    actor: AccessContext,
    input: RunAuthorizedSecurityTestRequest
  ): Promise<AuthorizedSecurityTestReport> {
    await this.assertPrivateModeActiveForSecurityWork(
      actor,
      "admin.authorized-testing.runs",
      "run_authorized_security_test"
    );
    return this.authorizedTesting.runAuthorizedSecurityTest(actor, input);
  }

  async startAdvancedPenetrationTest(
    actor: AccessContext,
    input: StartAdvancedPenetrationTestRequest
  ): Promise<PenetrationTestOrchestrator> {
    await this.assertPrivateModeActiveForSecurityWork(
      actor,
      "admin.authorized-testing.advanced-runs",
      "start_advanced_penetration_test"
    );

    return this.penetrationTesting.create({
      actor,
      target: input.target,
      verificationId: input.verificationId,
      runId: input.runId,
      authProfiles: input.authProfiles,
      authEndpointDescriptors: input.authEndpointDescriptors,
      manualFormValidation: input.manualFormValidation,
      maxPages: input.maxPages,
      maxRequests: input.maxRequests,
      conversationId: input.conversationId
    });
  }

  async listAdvancedPenetrationTests(
    actor: AccessContext,
    limit = 20
  ): Promise<AdvancedPenetrationTestRunSummary[]> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: "admin.authorized-testing.advanced-runs",
      action: "list_advanced_penetration_tests",
      reason: "Advanced penetration testing requires 'admin_dashboard' permission"
    });

    const tasks = await this.tasks.listPenetrationTestsByWorkspace(
      actor.workspaceId,
      Math.max(1, Math.min(100, Math.trunc(limit)))
    );

    return tasks
      .map((task) => this.toAdvancedPenetrationTestRunSummary(task))
      .filter((task): task is AdvancedPenetrationTestRunSummary => task !== null);
  }

  async getAdvancedPenetrationTestRun(
    actor: AccessContext,
    runId: string
  ): Promise<AdvancedPenetrationTestRunDetail> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource: `admin.authorized-testing.advanced-runs.${runId}`,
      action: "get_advanced_penetration_test_run",
      reason: "Advanced penetration testing requires 'admin_dashboard' permission"
    });

    const task = await this.tasks.findPenetrationTestByRunId(actor.workspaceId, runId);
    if (!task) {
      throw new AppError("Advanced penetration test run not found", 404);
    }

    return this.toAdvancedPenetrationTestRunDetail(task);
  }

  async getAdvancedPenetrationTestReport(
    actor: AccessContext,
    runId: string
  ): Promise<Record<string, unknown>> {
    const run = await this.getAdvancedPenetrationTestRun(actor, runId);
    if (!run.report) {
      throw new AppError("Advanced penetration test report is not ready yet", 409, {
        runId,
        status: run.status
      });
    }

    return run.report;
  }

  async getAuthorizedSecurityTestRun(
    actor: AccessContext,
    runId: string
  ): Promise<AuthorizedSecurityTestReport> {
    return this.authorizedTesting.getAuthorizedSecurityTestRun(actor, runId);
  }

  async listAuthorizedSecurityTestRuns(
    actor: AccessContext,
    limit = 20
  ): Promise<AuthorizedSecurityTestRunSummary[]> {
    return this.authorizedTesting.listAuthorizedSecurityTestRuns(actor, limit);
  }

  async getPrivateModeConfig(actor: AccessContext): Promise<CloakingConfig> {
    await this.assertAdminPermission(actor, "admin.private-mode.config", "view_private_mode");
    return this.privateMode.getConfig(actor.workspaceId);
  }

  async updatePrivateModeConfig(
    actor: AccessContext,
    input: Partial<CloakingConfig>
  ): Promise<CloakingConfig> {
    await this.assertAdminPermission(actor, "admin.private-mode.config", "update_private_mode_config");
    await this.policy.evaluatePolicy({
      actor,
      action: "admin.private_mode.config.update",
      categories: ["security_research", "external_url_access"],
      metadata: {
        outboundStrategy: input.outboundStrategy,
        enabledCategories: input.enabledCategories
      }
    });

    return this.privateMode.updateConfig(actor.workspaceId, input);
  }

  async activatePrivateMode(
    actor: AccessContext,
    input: Partial<CloakingConfig>
  ): Promise<CloakingSession> {
    await this.assertAdminPermission(actor, "admin.private-mode.activate", "activate_private_mode");
    const currentConfig = await this.privateMode.getConfig(actor.workspaceId);
    const config: CloakingConfig = {
      ...currentConfig,
      ...input,
      workspaceId: actor.workspaceId,
      mode: "cloaked",
      vpnRelays: input.vpnRelays ?? currentConfig.vpnRelays,
      exitGeographyPreference:
        input.exitGeographyPreference ?? currentConfig.exitGeographyPreference,
      enabledCategories: input.enabledCategories ?? currentConfig.enabledCategories
    };
    await this.policy.evaluatePolicy({
      actor,
      action: "admin.private_mode.activate",
      categories: ["security_research", "external_url_access"],
      metadata: {
        outboundStrategy: config.outboundStrategy,
        enabledCategories: config.enabledCategories
      }
    });

    return this.privateMode.activatePrivateMode(actor.workspaceId, config);
  }

  async deactivatePrivateMode(
    actor: AccessContext,
    sessionId?: string
  ): Promise<void> {
    await this.assertAdminPermission(actor, "admin.private-mode.activate", "deactivate_private_mode");
    const session =
      sessionId ? await this.privateMode.getCircuitStatus(sessionId).catch(() => null) : null;
    const activeSession = session
      ? {
          id: session.sessionId,
          workspaceId: session.workspaceId
        }
      : await this.privateMode.getActiveSession(actor.workspaceId);

    if (!activeSession) {
      return;
    }

    await this.privateMode.deactivatePrivateMode(activeSession.id);
  }

  async getPrivateModeSession(
    actor: AccessContext
  ): Promise<CloakingSession | null> {
    await this.assertAdminPermission(actor, "admin.private-mode.session", "view_private_mode_session");
    return this.privateMode.getActiveSession(actor.workspaceId);
  }

  async getPrivateModeSessionState(
    actor: AccessContext
  ): Promise<PrivateModeSessionState> {
    await this.assertAdminPermission(
      actor,
      "admin.private-mode.session",
      "view_private_mode_session"
    );

    const session = await this.privateMode.getActiveSession(actor.workspaceId);
    if (!session) {
      return {
        session: null,
        circuit: null,
        verification: null,
        routeVerified: false,
        verificationError: null
      };
    }

    const circuit = await this.privateMode.getCircuitStatus(session.id);
    let verificationError: string | null = null;
    const verification = await this.privateMode
      .verifyCloaking(actor.workspaceId)
      .catch((error) => {
        verificationError =
          error instanceof Error
            ? error.message
            : "Failed to verify the current private mode route.";
        return null;
      });

    return {
      session,
      circuit,
      verification,
      routeVerified: this.isRouteVerified(verification),
      verificationError
    };
  }

  async verifyPrivateMode(
    actor: AccessContext
  ): Promise<CloakingVerificationResult> {
    await this.assertAdminPermission(actor, "admin.private-mode.verify", "verify_private_mode");
    await this.policy.evaluatePolicy({
      actor,
      action: "admin.private_mode.verify",
      categories: ["external_url_access"],
      metadata: {
        verification: "private_mode"
      }
    });

    return this.privateMode.verifyCloaking(actor.workspaceId);
  }

  async runPrivateModeLeakTest(actor: AccessContext): Promise<LeakTestResult> {
    await this.assertAdminPermission(actor, "admin.private-mode.verify", "run_private_mode_leak_test");
    await this.policy.evaluatePolicy({
      actor,
      action: "admin.private_mode.leak_test",
      categories: ["external_url_access", "security_research"],
      metadata: {
        verification: "leak_test"
      }
    });

    return this.privateMode.runLeakTest(actor.workspaceId);
  }

  async rotatePrivateModeCircuit(
    actor: AccessContext,
    sessionId?: string
  ): Promise<CircuitStatus> {
    await this.assertAdminPermission(actor, "admin.private-mode.rotate", "rotate_private_mode_circuit");
    const activeSession =
      sessionId ? { id: sessionId } : await this.privateMode.getActiveSession(actor.workspaceId);

    if (!activeSession) {
      throw new AppError("Private mode is not active for this workspace.", 400);
    }

    await this.privateMode.rotateCircuit(activeSession.id);
    return this.privateMode.getCircuitStatus(activeSession.id);
  }

  async listPrivateModeExitLogs(
    actor: AccessContext,
    limit = 50
  ): Promise<ExitLog[]> {
    await this.assertAdminPermission(actor, "admin.private-mode.exit-logs", "list_private_mode_exit_logs");
    return this.privateMode.listExitLogs(actor.workspaceId, limit);
  }

  async getPrivateModeCircuitStatus(
    actor: AccessContext,
    sessionId?: string
  ): Promise<CircuitStatus | null> {
    await this.assertAdminPermission(actor, "admin.private-mode.session", "view_private_mode_circuit_status");
    const activeSession =
      sessionId ? { id: sessionId } : await this.privateMode.getActiveSession(actor.workspaceId);

    if (!activeSession) {
      return null;
    }

    return this.privateMode.getCircuitStatus(activeSession.id);
  }

  private toAdvancedPenetrationTestRunSummary(
    task: TaskEntity
  ): AdvancedPenetrationTestRunSummary | null {
    const record = this.getPersistedPenetrationTestRecord(task);
    if (!record?.runId) {
      return null;
    }

    const report = record.report;
    const vulnerabilities = Array.isArray(report?.vulnerabilities)
      ? report.vulnerabilities.length
      : Array.isArray(record.context?.vulnerabilities)
        ? record.context.vulnerabilities.length
        : 0;
    const attackChains = Array.isArray(report?.attackChains)
      ? report.attackChains.length
      : Array.isArray(record.context?.attackChains)
        ? record.context.attackChains.length
        : 0;

    return {
      runId: record.runId,
      taskId: record.taskId ?? task.id,
      agentId: record.agentId ?? task.agentId,
      target:
        this.readString(report?.target) ??
        this.readString(record.context?.target) ??
        task.objective,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      startedAt:
        this.readString(report?.startTime) ??
        this.readString(record.context?.startTime),
      completedAt: this.readString(report?.endTime),
      vulnerabilities,
      attackChains,
      finalSummary: task.metadata.finalSummary ?? task.result
    };
  }

  private toAdvancedPenetrationTestRunDetail(
    task: TaskEntity
  ): AdvancedPenetrationTestRunDetail {
    const record = this.getPersistedPenetrationTestRecord(task);
    if (!record?.runId) {
      throw new AppError("Advanced penetration test run metadata is missing", 500, {
        taskId: task.id
      });
    }

    return {
      runId: record.runId,
      taskId: record.taskId ?? task.id,
      agentId: record.agentId ?? task.agentId,
      target:
        this.readString(record.report?.target) ??
        this.readString(record.context?.target) ??
        task.objective,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      startedAt:
        this.readString(record.report?.startTime) ??
        this.readString(record.context?.startTime),
      completedAt: this.readString(record.report?.endTime),
      finalSummary: task.metadata.finalSummary ?? task.result,
      context: record.context ?? {},
      auditTrail: record.auditTrail ?? [],
      report: record.report
    };
  }

  private getPersistedPenetrationTestRecord(
    task: TaskEntity
  ): PersistedPenetrationTestRecord | null {
    const metadata = task.metadata as TaskEntity["metadata"] & {
      penetrationTest?: PersistedPenetrationTestRecord;
    };
    const record = metadata.penetrationTest;
    if (!record || typeof record !== "object") {
      return null;
    }

    return record;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  private toManagedUser(user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    preferences: Record<string, unknown>;
    lastLoginAt?: string;
    createdAt: string;
    updatedAt: string;
  }): ManagedUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role === "user" ? "developer" : (user.role as CanonicalUserRole),
      preferences: user.preferences,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  private async assertAdminPermission(
    actor: AccessContext,
    resource: string,
    action: string
  ): Promise<void> {
    await this.authorization.assertPermission(actor, "admin_dashboard", {
      layer: "service",
      resource,
      action,
      reason: "Private mode requires 'admin_dashboard' permission"
    });
  }

  private async assertPrivateModeActiveForSecurityWork(
    actor: AccessContext,
    resource: string,
    action: string
  ): Promise<void> {
    await this.assertAdminPermission(actor, resource, action);

    const session = await this.privateMode.getActiveSession(actor.workspaceId);
    if (!session) {
      throw new AppError(
        "Private Mode must be active before using website scanning or security testing modules.",
        403,
        {
          requiredAction: "activate_private_mode",
          privateModePath: "/admin/private-mode",
          workspaceId: actor.workspaceId
        }
      );
    }

    const verification = await this.privateMode
      .verifyCloaking(actor.workspaceId)
      .catch((error) => {
        throw new AppError(
          "Private Mode exit path could not be verified before starting a security tool.",
          403,
          {
            requiredAction: "verify_private_mode",
            privateModePath: "/admin/private-mode",
            workspaceId: actor.workspaceId,
            reason:
              error instanceof Error ? error.message : "verification_unavailable"
          }
        );
      });

    if (this.isRouteVerified(verification)) {
      return;
    }

    throw new AppError(
      "Private Mode must be active and its exit path verified before using website scanning or security testing modules.",
      403,
      {
        requiredAction: "verify_private_mode",
        privateModePath: "/admin/private-mode",
        workspaceId: actor.workspaceId,
        routeVerified: false,
        leaks: verification.leaks,
        advisories: verification.advisories,
        exitIp: verification.exitIp,
        verificationCategory: verification.verificationCategory,
        transportVerified: verification.transportVerified
      }
    );
  }

  private isRouteVerified(
    verification: CloakingVerificationResult | null
  ): boolean {
    return Boolean(
      verification?.isCloaked && verification.transportVerified
    );
  }
}
