import assert from "node:assert/strict";
import test from "node:test";

import { SystemProtectionService } from "../src/services/system-protection/system-protection.service";

function createConfig() {
  return {
    workspaceId: "workspace-1",
    mode: "direct" as const,
    outboundStrategy: "tor" as const,
    vpnRelays: [],
    torControlPort: 9051,
    torSocksPort: 9050,
    dnsOverTor: true,
    exitGeographyPreference: [],
    circuitRotationInterval: 300,
    tlsFingerprintProfile: "browser" as const,
    requestTimingJitter: 0,
    enabledCategories: ["security_research", "external_url_access"] as const
  };
}

function createSession() {
  const now = "2026-07-07T08:30:00.000Z";
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    strategy: "tor" as const,
    exitNodes: ["185.220.101.12"],
    circuitIds: ["tor:circuit-1"],
    startedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function createCloakingVerification() {
  return {
    exitIp: "185.220.101.12",
    isCloaked: true,
    leaks: [],
    directIdentity: {
      ip: "203.0.113.10",
      city: "Jeddah",
      region: "Makkah",
      country: "Saudi Arabia",
      countryCode: "SA",
      timezone: "Asia/Riyadh",
      organization: "Direct ISP",
      asn: "AS64510",
      network: "ipv4" as const,
      isTorExit: false
    },
    exitIdentity: {
      ip: "185.220.101.12",
      city: "Amsterdam",
      region: "North Holland",
      country: "Netherlands",
      countryCode: "NL",
      timezone: "Europe/Amsterdam",
      organization: "Tor Exit",
      asn: "AS64588",
      network: "ipv4" as const,
      isTorExit: true
    },
    dnsTransport: "tor" as const,
    verificationCategory: "external_url_access" as const,
    transportVerified: true,
    advisories: []
  };
}

function createFullProtectionVerification() {
  return {
    passed: true,
    verifiedAt: "2026-07-07T08:31:00.000Z",
    leaks: [],
    advisories: [],
    results: {
      systemProxy: {
        passed: true,
        details: ["ok"],
        bridgeListening: true,
        localHttpProxyPort: 9080,
        winInetConfigured: true,
        winHttpConfigured: true
      },
      browserProxy: {
        passed: true,
        details: ["ok"],
        configuredBrowsers: ["chrome", "edge", "firefox"],
        shortcutPaths: ["Chrome - Protected.lnk"]
      },
      appProxy: {
        passed: true,
        details: ["ok"],
        enforcedPrograms: ["chrome.exe"]
      },
      webrtc: {
        passed: true,
        details: ["ok"],
        configuredBrowsers: ["chrome", "edge", "firefox"]
      },
      dns: {
        passed: true,
        details: ["ok"],
        torDnsPortReachable: true,
        protectedAdapters: ["Ethernet"]
      },
      ipLeak: {
        passed: true,
        details: ["ok"],
        activeRuleNames: ["Block DNS leaks"]
      },
      fingerprint: {
        passed: true,
        details: ["ok"],
        hardenedBrowsers: ["firefox"]
      }
    }
  };
}

test("SystemProtectionService activates Tor-backed system protection and reports protected status", async () => {
  const activationCalls: Array<Record<string, unknown>> = [];
  let currentConfig = createConfig();
  let activeSession: ReturnType<typeof createSession> | null = null;
  const privateMode = {
    getConfig: async () => currentConfig,
    activatePrivateMode: async (_workspaceId: string, config: typeof currentConfig) => {
      activationCalls.push(config);
      currentConfig = {
        ...config
      };
      activeSession = createSession();
      return activeSession;
    },
    deactivateWorkspace: async () => undefined,
    getActiveSession: async () => activeSession,
    verifyCloaking: async () => createCloakingVerification()
  };
  const fullProtectionToggle = {
    verifyFullProtection: async () => createFullProtectionVerification()
  };

  const service = new SystemProtectionService(
    privateMode as never,
    fullProtectionToggle as never
  );

  const status = await service.activateProtection({
    workspaceId: "workspace-1",
    torSocksPort: 9150,
    torControlPort: 9151
  });

  assert.equal(status.active, true);
  assert.equal(status.protectionLevel, "protected");
  assert.equal(status.routeVerified, true);
  assert.equal(status.session?.id, "session-1");
  assert.equal(status.config.mode, "cloaked");
  assert.equal(status.config.torSocksPort, 9150);
  assert.equal(status.config.torControlPort, 9151);
  assert.equal(activationCalls.length, 1);
  assert.equal(activationCalls[0]?.mode, "cloaked");
});

test("SystemProtectionService rejects vpn-chain activation because it cannot enforce the route locally", async () => {
  const service = new SystemProtectionService(
    {
      getConfig: async () => createConfig()
    } as never,
    {} as never
  );

  await assert.rejects(
    service.activateProtection({
      workspaceId: "workspace-1",
      outboundStrategy: "vpn-chain"
    }),
    /requires a Tor-backed strategy/i
  );
});

test("SystemProtectionService deactivates the current workspace protection and reports an inactive state", async () => {
  let currentConfig = createConfig();
  let activeSession = createSession();
  let deactivationCount = 0;
  const privateMode = {
    getConfig: async () => currentConfig,
    activatePrivateMode: async () => activeSession,
    deactivateWorkspace: async () => {
      deactivationCount += 1;
      currentConfig = {
        ...currentConfig,
        mode: "direct"
      };
      activeSession = null as never;
    },
    getActiveSession: async () => activeSession,
    verifyCloaking: async () => createCloakingVerification()
  };

  const service = new SystemProtectionService(
    privateMode as never,
    {
      verifyFullProtection: async () => createFullProtectionVerification()
    } as never
  );

  const status = await service.deactivateProtection("workspace-1");

  assert.equal(deactivationCount, 1);
  assert.equal(status.active, false);
  assert.equal(status.protectionLevel, "inactive");
  assert.equal(status.session, null);
});
