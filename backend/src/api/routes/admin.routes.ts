import { Router } from "express";
import { z } from "zod";

import { authorize } from "../middlewares/authorization.middleware";
import { AdminController } from "../controllers/admin.controller";
import { PolicyController } from "../controllers/policy.controller";
import { asyncHandler } from "../../utils/async-handler";
import {
  validateBody,
  validateParams,
  validateQuery
} from "../middlewares/validate.middleware";
import { AuthorizationService } from "../../services/authorization/authorization.service";
import {
  POLICY_ASSIGNMENT_TYPES,
  POLICY_CATEGORIES,
  POLICY_DECISIONS,
  POLICY_MODES,
  POLICY_SCOPE_TYPES
} from "../../policy/policy.types";

export function createAdminRoutes(
  controller: AdminController,
  policyController: PolicyController,
  authorization: AuthorizationService
) {
  const router = Router();
  const policyRuleSchema = z.object({
    id: z.string().uuid().optional(),
    category: z.enum(POLICY_CATEGORIES),
    decision: z.enum(POLICY_DECISIONS),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(5000).optional(),
    description: z.string().optional(),
    toolNames: z.array(z.string()).optional(),
    roleScopes: z.array(z.enum(["super_admin", "admin", "manager", "developer", "viewer"])).optional(),
    workspaceRoleScopes: z.array(z.enum(["owner", "admin", "member", "viewer"])).optional(),
    modelPatterns: z.array(z.string()).optional(),
    conditions: z
      .object({
        contentPatterns: z.array(z.string()).optional(),
        urlHosts: z.array(z.string()).optional(),
        urlNotHosts: z.array(z.string()).optional(),
        fileExtensions: z.array(z.string()).optional(),
        maxFileSizeBytes: z.number().int().positive().optional(),
        metadataEquals: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean()])
        ).optional()
      })
      .optional()
  });
  const policyAssignmentSchema = z.object({
    id: z.string().uuid().optional(),
    scopeType: z.enum(POLICY_SCOPE_TYPES),
    scopeId: z.string().uuid().optional(),
    assignmentType: z.enum(POLICY_ASSIGNMENT_TYPES).optional(),
    mode: z.enum(POLICY_MODES).optional(),
    priority: z.number().int().min(0).max(5000).optional(),
    isActive: z.boolean().optional()
  });
  const policyUpsertSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    mode: z.enum(POLICY_MODES).optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    rules: z.array(policyRuleSchema).min(1),
    assignments: z.array(policyAssignmentSchema).min(1)
  });
  const websiteScanSchema = z.object({
    url: z.string().trim().min(1),
    maxPages: z.coerce.number().int().min(1).max(10).default(4)
  });
  const securityReviewSchema = z.object({
    url: z.string().trim().min(1),
    maxPages: z.coerce.number().int().min(1).max(10).default(4)
  });
  const domainVerificationSchema = z.object({
    target: z.string().trim().min(1),
    method: z.enum(["dns_txt", "http_file", "html_meta"]).default("dns_txt"),
    devModeBypass: z.boolean().optional()
  });
  const domainVerificationCheckSchema = z.object({
    devModeBypass: z.boolean().optional()
  });
  const authorizedTestingRunSchema = z.object({
    verificationId: z.string().uuid().optional(),
    url: z.string().trim().min(1),
    maxPages: z.coerce.number().int().min(1).max(8).default(4),
    maxRequests: z.coerce.number().int().min(6).max(40).default(18),
    devModeBypass: z.boolean().optional(),
    modules: z
      .array(
        z.enum([
          "sql_injection",
          "xss",
          "authentication",
          "authorization",
          "api_security",
          "waf",
          "session_management"
        ])
      )
      .max(7)
      .optional(),
    authProfiles: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          role: z.enum(["anonymous", "low_privilege", "high_privilege"]),
          headers: z.record(z.string(), z.string()).optional(),
          cookies: z.record(z.string(), z.string()).optional()
        })
      )
      .max(4)
      .optional()
  });

  router.get(
    "/dashboard",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.dashboard",
      action: "GET /admin/dashboard"
    }),
    asyncHandler(controller.dashboard)
  );
  router.post(
    "/website-scan",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.website.scan",
      action: "POST /admin/website-scan"
    }),
    validateBody(websiteScanSchema),
    asyncHandler(controller.scanWebsite)
  );
  router.post(
    "/security-review",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.security-review-lab",
      action: "POST /admin/security-review"
    }),
    validateBody(securityReviewSchema),
    asyncHandler(controller.runSecurityReview)
  );
  router.get(
    "/authorized-testing/verifications",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.authorized-testing.verifications",
      action: "GET /admin/authorized-testing/verifications"
    }),
    validateQuery(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(25)
      })
    ),
    asyncHandler(controller.listDomainVerifications)
  );
  router.get(
    "/authorized-testing/dev-mode",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.authorized-testing.dev-mode",
      action: "GET /admin/authorized-testing/dev-mode"
    }),
    asyncHandler(controller.getAuthorizedTestingDevMode)
  );
  router.post(
    "/authorized-testing/verifications",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.authorized-testing.verifications",
      action: "POST /admin/authorized-testing/verifications"
    }),
    validateBody(domainVerificationSchema),
    asyncHandler(controller.startDomainVerification)
  );
  router.post(
    "/authorized-testing/verifications/:verificationId/check",
    authorize(authorization, "admin_dashboard", {
      resource: (request) =>
        `admin.authorized-testing.verifications.${request.params.verificationId}`,
      action: "POST /admin/authorized-testing/verifications/:verificationId/check"
    }),
    validateParams(
      z.object({
        verificationId: z.string().uuid()
      })
    ),
    validateBody(domainVerificationCheckSchema),
    asyncHandler(controller.checkDomainVerification)
  );
  router.get(
    "/authorized-testing/runs",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.authorized-testing.runs",
      action: "GET /admin/authorized-testing/runs"
    }),
    validateQuery(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20)
      })
    ),
    asyncHandler(controller.listAuthorizedSecurityTestRuns)
  );
  router.get(
    "/authorized-testing/runs/:runId",
    authorize(authorization, "admin_dashboard", {
      resource: (request) => `admin.authorized-testing.runs.${request.params.runId}`,
      action: "GET /admin/authorized-testing/runs/:runId"
    }),
    validateParams(
      z.object({
        runId: z.string().uuid()
      })
    ),
    asyncHandler(controller.getAuthorizedSecurityTestRun)
  );
  router.post(
    "/authorized-testing/runs",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.authorized-testing.runs",
      action: "POST /admin/authorized-testing/runs"
    }),
    validateBody(authorizedTestingRunSchema),
    asyncHandler(controller.runAuthorizedSecurityTest)
  );
  router.post(
    "/network/scan",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.network",
      action: "POST /admin/network/scan"
    }),
    asyncHandler(controller.startNetworkScan)
  );
  router.post(
    "/network/resolve-names",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.network",
      action: "POST /admin/network/resolve-names"
    }),
    asyncHandler(controller.resolveNetworkNames)
  );
  router.get(
    "/network",
    authorize(authorization, "admin_dashboard", {
      resource: "admin.network",
      action: "GET /admin/network"
    }),
    asyncHandler(controller.scanNetwork)
  );
  router.get(
    "/users",
    authorize(authorization, "user_management", {
      resource: "admin.users",
      action: "GET /admin/users"
    }),
    validateQuery(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50)
      })
    ),
    asyncHandler(controller.listUsers)
  );
  router.patch(
    "/users/:userId/role",
    authorize(authorization, "user_management", {
      resource: (request) => `admin.users.${request.params.userId}.role`,
      action: "PATCH /admin/users/:userId/role"
    }),
    validateParams(
      z.object({
        userId: z.string().uuid()
      })
    ),
    validateBody(
      z.object({
        role: z.enum(["super_admin", "admin", "manager", "developer", "viewer"])
      })
    ),
    asyncHandler(controller.updateUserRole)
  );
  router.get("/policies", asyncHandler(policyController.list));
  router.post(
    "/policies",
    validateBody(policyUpsertSchema),
    asyncHandler(policyController.create)
  );
  router.put(
    "/policies/:policyId",
    validateParams(
      z.object({
        policyId: z.string().uuid()
      })
    ),
    validateBody(policyUpsertSchema),
    asyncHandler(policyController.update)
  );
  router.delete(
    "/policies/:policyId",
    validateParams(
      z.object({
        policyId: z.string().uuid()
      })
    ),
    asyncHandler(policyController.delete)
  );
  router.post(
    "/policies/evaluate",
    validateBody(
      z.object({
        action: z.string().min(1),
        categories: z.array(z.enum(POLICY_CATEGORIES)).min(1),
        toolName: z.string().optional(),
        model: z.string().optional(),
        provider: z.string().optional(),
        content: z.string().optional(),
        url: z.string().url().optional(),
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
        fileSizeBytes: z.number().int().positive().optional(),
        sql: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        roleOverride: z.enum(["super_admin", "admin", "manager", "developer", "viewer"]).optional(),
        workspaceRoleOverride: z.enum(["owner", "admin", "member", "viewer"]).optional()
      })
    ),
    asyncHandler(policyController.evaluate)
  );
  router.get(
    "/policies/audit-logs",
    validateQuery(
      z.object({
        limit: z.coerce.number().int().min(1).max(500).default(100)
      })
    ),
    asyncHandler(policyController.listAuditLogs)
  );
  router.put(
    "/policies/workspace-mode",
    validateBody(
      z.object({
        mode: z.enum(POLICY_MODES),
        policyId: z.string().uuid().optional()
      })
    ),
    asyncHandler(policyController.setWorkspaceMode)
  );
  return router;
}
