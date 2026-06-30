import test from "node:test";
import assert from "node:assert/strict";

import { AccessContext } from "../src/authorization/authorization.types";
import { AppError } from "../src/utils/app-error";
import {
  AdminService,
  PrivateModeSessionState
} from "../src/services/admin/admin.service";
import {
  CircuitStatus,
  CloakingSession,
  CloakingVerificationResult
} from "../src/services/private-mode/private-mode.types";

function createActor(): AccessContext {
  return {
    userId: "user-1",
    email: "user-1@example.com",
    displayName: "User One",
    role: "admin",
    workspaceId: "workspace-1",
    workspaceName: "Workspace One",
    workspaceSlug: "workspace-one",
    workspaceRole: "owner",
    organizationId: "org-1",
    organizationName: "Org One",
    isPersonalWorkspace: false,
    permissions: ["admin_dashboard"]
  };
}

function createSession(): CloakingSession {
  const now = "2026-06-25T09:05:00.000Z";
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    strategy: "tor",
    exitNodes: ["185.220.100.241"],
    circuitIds: ["tor:circuit-1"],
    startedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function createCircuitStatus(): CircuitStatus {
  return {
    sessionId: "session-1",
    workspaceId: "workspace-1",
    strategy: "tor",
    active: true,
    exitNodes: ["185.220.100.241"],
    circuitIds: ["tor:circuit-1"],
    lastRotatedAt: "2026-06-25T09:05:00.000Z"
  };
}

function createVerification(
  overrides: Partial<CloakingVerificationResult> = {}
): CloakingVerificationResult {
  return {
    exitIp: "185.220.100.241",
    isCloaked: true,
    leaks: [],
    directIdentity: {
      ip: "203.0.113.10",
      city: "Riyadh",
      region: "Riyadh",
      country: "Saudi Arabia",
      countryCode: "SA",
      timezone: "Asia/Riyadh",
      organization: "Direct ISP",
      asn: "AS64510",
      network: "ipv4",
      isTorExit: false
    },
    exitIdentity: {
      ip: "185.220.100.241",
      city: "Amsterdam",
      region: "North Holland",
      country: "Netherlands",
      countryCode: "NL",
      timezone: "Europe/Amsterdam",
      organization: "Tor Exit",
      asn: "AS64588",
      network: "ipv4",
      isTorExit: true
    },
    dnsTransport: "tor",
    verificationCategory: "external_url_access",
    transportVerified: true,
    advisories: [],
    ...overrides
  };
}

function createAdminService(options: {
  session?: CloakingSession | null;
  verification?: CloakingVerificationResult;
  verificationError?: Error;
}) {
  const websiteScanCalls: Array<Record<string, unknown>> = [];

  const admin = new AdminService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      assertPermission: async () => undefined
    } as never,
    {} as never,
    {} as never,
    {
      scanWebsite: async (_actor: AccessContext, input: Record<string, unknown>) => {
        websiteScanCalls.push(input);
        return {
          scannedAt: "2026-06-25T09:10:00.000Z"
        } as never;
      }
    } as never,
    {} as never,
    {} as never,
    {
      getActiveSession: async () => options.session ?? null,
      verifyCloaking: async () => {
        if (options.verificationError) {
          throw options.verificationError;
        }

        return options.verification ?? createVerification();
      },
      getCircuitStatus: async () => createCircuitStatus()
    } as never,
    {} as never
  );

  return {
    admin,
    websiteScanCalls
  };
}

test("AdminService blocks website scanning when Private Mode is inactive", async () => {
  const actor = createActor();
  const { admin, websiteScanCalls } = createAdminService({
    session: null
  });

  await assert.rejects(
    admin.scanWebsite(actor, {
      url: "https://example.com"
    }),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 403 &&
      error.message ===
        "Private Mode must be active before using website scanning or security testing modules."
  );

  assert.equal(websiteScanCalls.length, 0);
});

test("AdminService blocks website scanning when the cloaked route is not verified", async () => {
  const actor = createActor();
  const { admin, websiteScanCalls } = createAdminService({
    session: createSession(),
    verification: createVerification({
      isCloaked: false,
      transportVerified: false,
      leaks: ["tor_exit_unconfirmed"]
    })
  });

  await assert.rejects(
    admin.scanWebsite(actor, {
      url: "https://example.com"
    }),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 403 &&
      error.message ===
        "Private Mode must be active and its exit path verified before using website scanning or security testing modules."
  );

  assert.equal(websiteScanCalls.length, 0);
});

test("AdminService allows website scanning only after the cloaked route is verified", async () => {
  const actor = createActor();
  const { admin, websiteScanCalls } = createAdminService({
    session: createSession(),
    verification: createVerification()
  });

  await admin.scanWebsite(actor, {
    url: "https://example.com"
  });

  assert.equal(websiteScanCalls.length, 1);
});

test("AdminService surfaces route verification state in the private mode session endpoint", async () => {
  const actor = createActor();
  const { admin } = createAdminService({
    session: createSession(),
    verification: createVerification({
      isCloaked: false,
      transportVerified: false,
      leaks: ["exit_ip_unavailable"]
    })
  });

  const state = (await admin.getPrivateModeSessionState(
    actor
  )) as PrivateModeSessionState;

  assert.equal(state.session?.id, "session-1");
  assert.equal(state.circuit?.sessionId, "session-1");
  assert.equal(state.routeVerified, false);
  assert.deepEqual(state.verification?.leaks, ["exit_ip_unavailable"]);
  assert.equal(state.verificationError, null);
});
