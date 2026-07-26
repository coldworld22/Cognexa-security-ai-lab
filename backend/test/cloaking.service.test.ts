import test from "node:test";
import assert from "node:assert/strict";

import { CloakingService } from "../src/services/private-mode/cloaking.service";
import { CloakingConfig } from "../src/services/private-mode/private-mode.types";

function createConfig(
  overrides: Partial<CloakingConfig> = {}
): CloakingConfig & {
  id: string;
  createdAt: string;
  updatedAt: string;
} {
  const now = "2026-06-25T09:00:00.000Z";
  return {
    id: "workspace-1",
    workspaceId: "workspace-1",
    mode: "cloaked",
    outboundStrategy: "tor",
    vpnRelays: [],
    torControlPort: 9051,
    torSocksPort: 9050,
    dnsOverTor: true,
    exitGeographyPreference: [],
    circuitRotationInterval: 900,
    tlsFingerprintProfile: "browser",
    requestTimingJitter: 0,
    enabledCategories: [
      "security_research",
      "vulnerability_analysis",
      "external_url_access"
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createSession(overrides: Partial<Record<string, unknown>> = {}) {
  const now = "2026-06-25T09:05:00.000Z";
  return {
    id: "session-1",
    workspaceId: "workspace-1",
    strategy: "tor",
    exitNodes: ["tor-pending"],
    circuitIds: ["tor:circuit-1"],
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

function buildCurlResponse(
  url: string,
  body: string,
  contentType = "application/json"
): string {
  return `HTTP/1.1 200 OK\r
Content-Type: ${contentType}\r
\r
${body}__COGNEXA_CLOAKING_META__200|${url}`;
}

function buildCurlJson(url: string, body: Record<string, unknown>): string {
  return buildCurlResponse(url, JSON.stringify(body));
}

function createService(options: {
  config: ReturnType<typeof createConfig>;
  directFetch: typeof fetch;
  proxyManager?: unknown;
}) {
  const session = createSession({
    strategy: options.config.outboundStrategy
  });
  const exitLogCalls: Array<Record<string, unknown>> = [];

  const service = new CloakingService(
    {
      findByWorkspaceId: async () => options.config,
      upsert: async (input: Record<string, unknown>) => input
    } as never,
    {
      findActiveByWorkspaceId: async () => session,
      findById: async () => session,
      updateRuntime: async (_sessionId: string, input: { exitNodes?: string[]; circuitIds?: string[] }) => ({
        ...session,
        exitNodes: input.exitNodes ?? session.exitNodes,
        circuitIds: input.circuitIds ?? session.circuitIds
      })
    } as never,
    {
      create: async (input: Record<string, unknown>) => {
        exitLogCalls.push(input);
      }
    } as never,
    {
      warn: () => undefined,
      info: () => undefined,
      error: () => undefined,
      debug: () => undefined
    } as never,
    {
      directFetch: options.directFetch,
      proxyManager: options.proxyManager as never
    }
  );

  return {
    service,
    session,
    exitLogCalls
  };
}

test("CloakingService exposes detailed direct and exit identities for vpn-chain", async () => {
  const config = createConfig({
    outboundStrategy: "vpn-chain",
    dnsOverTor: false
  });

  const { service, exitLogCalls } = createService({
    config,
    directFetch: (async (input) => {
      const url = String(input);
      if (url.includes("ipapi.co/json")) {
        return jsonResponse({
          ip: "198.51.100.15",
          city: "Frankfurt",
          region: "Hesse",
          country_name: "Germany",
          country_code: "DE",
          timezone: "Europe/Berlin",
          org: "Example VPN",
          asn: "AS64515",
          version: "IPv4"
        });
      }

      return jsonResponse({
        IP: "198.51.100.15",
        IsTor: false
      });
    }) as typeof fetch
  });

  const leakTest = await service.runLeakTest("workspace-1");

  assert.equal(leakTest.directIdentity?.organization, "Example VPN");
  assert.equal(leakTest.exitIdentity?.ip, "198.51.100.15");
  assert.equal(leakTest.transportVerified, false);
  assert.deepEqual(leakTest.leaks, []);
  assert.ok(
    leakTest.advisories.includes("vpn_chain_external_tunnel_required")
  );
  assert.ok(exitLogCalls.length >= 1);
});

test("CloakingService reports the supported Private Mode capabilities", () => {
  const { service } = createService({
    config: createConfig(),
    directFetch: (async () => jsonResponse({ ip: "203.0.113.10" })) as typeof fetch
  });

  assert.deepEqual(service.getCapabilities(), {
    torBackedStrategies: ["tor", "hybrid", "rotating-proxy"],
    externalTunnelRequiredStrategies: ["vpn-chain"],
    tlsHandshakeSpoofing: false,
    requestIdentityProfilesAdjustHeadersOnly: true
  });
});

test("CloakingService flags hybrid mode when only direct categories are enabled", async () => {
  const config = createConfig({
    outboundStrategy: "hybrid",
    enabledCategories: ["external_url_access"]
  });

  const { service } = createService({
    config,
    directFetch: (async (input) => {
      const url = String(input);
      if (url.includes("ipapi.co/json")) {
        return jsonResponse({
          ip: "203.0.113.44",
          city: "Riyadh",
          region: "Riyadh",
          country_name: "Saudi Arabia",
          country_code: "SA",
          timezone: "Asia/Riyadh",
          org: "Example ISP",
          asn: "AS64544",
          version: "IPv4"
        });
      }

      return jsonResponse({
        IP: "203.0.113.44",
        IsTor: false
      });
    }) as typeof fetch
  });

  const leakTest = await service.runLeakTest("workspace-1");

  assert.equal(leakTest.verificationCategory, "external_url_access");
  assert.equal(leakTest.transportVerified, false);
  assert.ok(
    leakTest.leaks.includes("dns_over_tor_requested_without_tor_transport")
  );
  assert.ok(
    leakTest.advisories.includes("hybrid_sensitive_categories_only")
  );
  assert.ok(
    leakTest.advisories.includes("hybrid_sensitive_categories_disabled")
  );
});

test("CloakingService verifies a Tor-backed route with an isolated exit identity", async () => {
  const config = createConfig({
    outboundStrategy: "tor"
  });

  const { service } = createService({
    config,
    directFetch: (async (input) => {
      const url = String(input);
      if (url.includes("ipapi.co/json")) {
        return jsonResponse({
          ip: "203.0.113.10",
          city: "Riyadh",
          region: "Riyadh",
          country_name: "Saudi Arabia",
          country_code: "SA",
          timezone: "Asia/Riyadh",
          org: "Direct ISP",
          asn: "AS64510",
          version: "IPv4"
        });
      }

      return jsonResponse({
        IP: "203.0.113.10",
        IsTor: false
      });
    }) as typeof fetch
  });

  (
    service as unknown as {
      execCurl: (args: string[]) => Promise<string>;
    }
  ).execCurl = async (args: string[]) => {
    const url = args.at(-1) ?? "";
    if (url.includes("ipapi.co/json")) {
      return buildCurlJson(url, {
        ip: "198.51.100.88",
        city: "Amsterdam",
        region: "North Holland",
        country_name: "Netherlands",
        country_code: "NL",
        timezone: "Europe/Amsterdam",
        org: "Tor Exit",
        asn: "AS64588",
        version: "IPv4"
      });
    }

    return buildCurlJson(url, {
      IP: "198.51.100.88",
      IsTor: true
    });
  };

  const verification = await service.verifyCloaking("workspace-1");

  assert.equal(verification.isCloaked, true);
  assert.equal(verification.transportVerified, true);
  assert.equal(verification.directIdentity?.ip, "203.0.113.10");
  assert.equal(verification.exitIdentity?.ip, "198.51.100.88");
  assert.deepEqual(verification.leaks, []);
});

test("CloakingService falls back to ipify when ipapi returns a challenge page", async () => {
  const config = createConfig({
    outboundStrategy: "tor"
  });

  const { service } = createService({
    config,
    directFetch: (async (input) => {
      const url = String(input);

      if (url.includes("ipapi.co/json")) {
        return new Response("<html>challenge</html>", {
          status: 200,
          headers: {
            "content-type": "text/html"
          }
        });
      }

      if (url.includes("api64.ipify.org")) {
        return jsonResponse({
          ip: "203.0.113.10"
        });
      }

      return jsonResponse({
        IP: "203.0.113.10",
        IsTor: false
      });
    }) as typeof fetch
  });

  (
    service as unknown as {
      execCurl: (args: string[]) => Promise<string>;
    }
  ).execCurl = async (args: string[]) => {
    const url = args.at(-1) ?? "";

    if (url.includes("ipapi.co/json")) {
      return buildCurlResponse(url, "<html>challenge</html>", "text/html");
    }

    if (url.includes("api64.ipify.org")) {
      return buildCurlJson(url, {
        ip: "2a0b:f4c0:16c:15::1"
      });
    }

    return buildCurlJson(url, {
      IP: "185.220.100.241",
      IsTor: true
    });
  };

  const verification = await service.verifyCloaking("workspace-1");

  assert.equal(verification.isCloaked, true);
  assert.equal(verification.transportVerified, true);
  assert.equal(verification.directIdentity?.ip, "203.0.113.10");
  assert.equal(verification.exitIdentity?.ip, "2a0b:f4c0:16c:15::1");
  assert.equal(verification.exitIdentity?.isTorExit, true);
  assert.deepEqual(verification.leaks, []);
});

test("CloakingService clears stale proxy leak flags when Tor fallback verification succeeds", async () => {
  const config = createConfig({
    outboundStrategy: "tor"
  });

  const { service } = createService({
    config,
    directFetch: (async () => {
      throw new Error("direct identity unavailable");
    }) as typeof fetch,
    proxyManager: {
      isEnabledForWorkspace: () => true,
      verifyNoLeaks: async () => ({
        testedAt: "2026-07-06T12:30:00.000Z",
        strategy: "tor",
        directIp: null,
        exitIp: null,
        exitRegion: null,
        dnsTransport: "system",
        isTorExit: null,
        leaks: ["exit_ip_unavailable", "tor_exit_unconfirmed"],
        directIdentity: null,
        exitIdentity: null,
        verificationCategory: "external_url_access",
        transportVerified: false,
        advisories: ["webrtc_not_applicable_in_node_runtime"]
      })
    }
  });

  (
    service as unknown as {
      execCurl: (args: string[]) => Promise<string>;
    }
  ).execCurl = async (args: string[]) => {
    const url = args.at(-1) ?? "";

    if (url.includes("ipapi.co/json")) {
      return buildCurlResponse(url, "<html>challenge</html>", "text/html");
    }

    if (url.includes("api64.ipify.org")) {
      return buildCurlJson(url, {
        ip: "51.15.59.15"
      });
    }

    return buildCurlJson(url, {
      IP: "51.15.59.15",
      IsTor: true
    });
  };

  const verification = await service.verifyCloaking("workspace-1");

  assert.equal(verification.exitIp, "51.15.59.15");
  assert.equal(verification.exitIdentity?.ip, "51.15.59.15");
  assert.equal(verification.exitIdentity?.isTorExit, true);
  assert.equal(verification.transportVerified, true);
  assert.equal(verification.isCloaked, true);
  assert.deepEqual(verification.leaks, []);
});

test("CloakingService deactivates a workspace back to direct mode even without an active session", async () => {
  const configWrites: Array<Record<string, unknown>> = [];
  const disableCalls: Array<string | undefined> = [];
  let fullProtectionDisabled = 0;

  const service = new CloakingService(
    {
      findByWorkspaceId: async () => createConfig(),
      upsert: async (input: Record<string, unknown>) => {
        configWrites.push(input);
        return input;
      }
    } as never,
    {
      findActiveByWorkspaceId: async () => null,
      listActive: async () => []
    } as never,
    {} as never,
    {
      warn: () => undefined,
      info: () => undefined,
      error: () => undefined,
      debug: () => undefined
    } as never,
    {
      proxyManager: {
        disableSystemProxy: async (workspaceId?: string) => {
          disableCalls.push(workspaceId);
        }
      } as never,
      fullProtectionToggle: {
        deactivateFullProtection: async () => {
          fullProtectionDisabled += 1;
        }
      } as never
    }
  );

  await service.deactivateWorkspace("workspace-1");

  assert.equal(configWrites.length, 1);
  assert.equal(configWrites[0]?.mode, "direct");
  assert.deepEqual(disableCalls, [undefined]);
  assert.equal(fullProtectionDisabled, 1);
});

test("CloakingService clears stale startup sessions when proxy restore fails", async () => {
  const session = createSession();
  const endedSessions: string[] = [];
  const configWrites: Array<Record<string, unknown>> = [];
  const disableCalls: Array<string | undefined> = [];
  let fullProtectionDisabled = 0;

  const service = new CloakingService(
    {
      findByWorkspaceId: async () => createConfig(),
      upsert: async (input: Record<string, unknown>) => {
        configWrites.push(input);
        return input;
      }
    } as never,
    {
      listActive: async () => [session],
      endSession: async (sessionId: string) => {
        endedSessions.push(sessionId);
        return session;
      }
    } as never,
    {} as never,
    {
      warn: () => undefined,
      info: () => undefined,
      error: () => undefined,
      debug: () => undefined
    } as never,
    {
      proxyManager: {
        enableSystemProxy: async () => {
          throw new Error("Access is denied.");
        },
        disableSystemProxy: async (workspaceId?: string) => {
          disableCalls.push(workspaceId);
        }
      } as never,
      fullProtectionToggle: {
        deactivateFullProtection: async () => {
          fullProtectionDisabled += 1;
        }
      } as never
    }
  );

  await service.initialize();

  assert.deepEqual(endedSessions, ["session-1"]);
  assert.deepEqual(
    configWrites.map((write) => [write.workspaceId, write.mode]),
    [["workspace-1", "direct"]]
  );
  assert.deepEqual(disableCalls, [undefined]);
  assert.equal(fullProtectionDisabled, 1);
});

test("CloakingService shutdown restores normal networking without ending active sessions", async () => {
  const sessionOne = createSession();
  const sessionTwo = createSession({
    id: "session-2",
    workspaceId: "workspace-2",
    startedAt: "2026-06-25T09:15:00.000Z",
    createdAt: "2026-06-25T09:15:00.000Z",
    updatedAt: "2026-06-25T09:15:00.000Z"
  });
  const endedSessions: string[] = [];
  const configWrites: Array<Record<string, unknown>> = [];
  const disableCalls: Array<string | undefined> = [];
  let fullProtectionDisabled = 0;

  const service = new CloakingService(
    {
      findByWorkspaceId: async (workspaceId: string) =>
        createConfig({
          id: workspaceId,
          workspaceId
        }),
      upsert: async (input: Record<string, unknown>) => {
        configWrites.push(input);
        return input;
      }
    } as never,
    {
      listActive: async () => [sessionOne, sessionTwo],
      endSession: async (sessionId: string) => {
        endedSessions.push(sessionId);
        return sessionId === sessionTwo.id ? sessionTwo : sessionOne;
      }
    } as never,
    {} as never,
    {
      warn: () => undefined,
      info: () => undefined,
      error: () => undefined,
      debug: () => undefined
    } as never,
    {
      proxyManager: {
        disableSystemProxy: async (workspaceId?: string) => {
          disableCalls.push(workspaceId);
        }
      } as never,
      fullProtectionToggle: {
        deactivateFullProtection: async () => {
          fullProtectionDisabled += 1;
        }
      } as never
    }
  );

  await service.shutdown();

  assert.deepEqual(endedSessions, []);
  assert.deepEqual(configWrites, []);
  assert.deepEqual(disableCalls, [undefined]);
  assert.equal(fullProtectionDisabled, 1);
});

test("CloakingService re-applies process-wide protection when watchdog detects drift", async () => {
  const fullProtectionActivations: Array<Record<string, unknown>> = [];
  const proxyEnableCalls: string[] = [];

  const service = new CloakingService(
    {
      findByWorkspaceId: async () => createConfig()
    } as never,
    {
      listActive: async () => [createSession()]
    } as never,
    {} as never,
    {
      warn: () => undefined,
      info: () => undefined,
      error: () => undefined,
      debug: () => undefined
    } as never,
    {
      proxyManager: {
        isEnabledForWorkspace: () => false,
        enableSystemProxy: async (workspaceId: string) => {
          proxyEnableCalls.push(workspaceId);
        }
      } as never,
      fullProtectionToggle: {
        verifyFullProtection: async () => ({
          passed: false,
          verifiedAt: "2026-07-07T09:00:00.000Z",
          leaks: ["system_proxy_inactive"],
          advisories: [],
          results: {} as never
        }),
        activateFullProtection: async (input: Record<string, unknown>) => {
          fullProtectionActivations.push(input);
          return {
            passed: true,
            verifiedAt: "2026-07-07T09:00:01.000Z",
            leaks: [],
            advisories: [],
            results: {} as never
          };
        }
      } as never
    }
  );

  await (
    service as unknown as {
      maintainActiveProtection: () => Promise<void>;
    }
  ).maintainActiveProtection();

  assert.deepEqual(proxyEnableCalls, ["workspace-1"]);
  assert.equal(fullProtectionActivations.length, 1);
  assert.equal(fullProtectionActivations[0]?.workspaceId, "workspace-1");
});

test("CloakingService resyncs process-wide protection when an active config changes", async () => {
  const configWrites: Array<Record<string, unknown>> = [];
  const proxyEnableCalls: string[] = [];
  const fullProtectionActivations: Array<Record<string, unknown>> = [];
  const session = createSession();

  const service = new CloakingService(
    {
      findByWorkspaceId: async () => createConfig(),
      upsert: async (input: Record<string, unknown>) => {
        configWrites.push(input);
        return input;
      }
    } as never,
    {
      findActiveByWorkspaceId: async () => session
    } as never,
    {} as never,
    {
      warn: () => undefined,
      info: () => undefined,
      error: () => undefined,
      debug: () => undefined
    } as never,
    {
      proxyManager: {
        enableSystemProxy: async (workspaceId: string) => {
          proxyEnableCalls.push(workspaceId);
        }
      } as never,
      fullProtectionToggle: {
        activateFullProtection: async (input: Record<string, unknown>) => {
          fullProtectionActivations.push(input);
          return {
            passed: true,
            verifiedAt: "2026-07-07T09:10:00.000Z",
            leaks: [],
            advisories: [],
            results: {} as never
          };
        }
      } as never,
      setIntervalImpl: (() => 0) as typeof setInterval,
      clearIntervalImpl: (() => undefined) as typeof clearInterval
    }
  );

  const nextConfig = await service.updateConfig("workspace-1", {
    torSocksPort: 9150
  });

  assert.equal(nextConfig.torSocksPort, 9150);
  assert.equal(configWrites.length, 1);
  assert.deepEqual(proxyEnableCalls, ["workspace-1"]);
  assert.equal(fullProtectionActivations.length, 1);
  assert.equal(fullProtectionActivations[0]?.torSocksPort, 9150);
});
