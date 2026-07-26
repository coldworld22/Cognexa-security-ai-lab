import { Logger } from "pino";

import { AppProxyService } from "../app-proxy/app-proxy.service";
import { BrowserProxyService } from "../browser/browser-proxy.service";
import { SystemDNSService } from "../dns/system-dns.service";
import { BrowserFingerprintService } from "../fingerprint/browser-fingerprint.service";
import { IPLeakPreventionService } from "../ip-leak/ip-leak-prevention.service";
import {
  FullProtectionConfig,
  FullProtectionVerificationResult
} from "../private-mode/full-protection.types";
import { SystemProxyService } from "../system-proxy/system-proxy.service";
import { WebRTCBlockService } from "../webrtc/webrtc-block.service";

export interface FullProtectionToggleServiceOptions {
  logger?: Logger;
  now?: () => Date;
}

export class FullProtectionToggleService {
  private readonly logger?: Logger;
  private readonly now: () => Date;
  private lastConfig: FullProtectionConfig | null = null;

  constructor(
    private readonly systemProxy: SystemProxyService,
    private readonly browserProxy: BrowserProxyService,
    private readonly appProxy: AppProxyService,
    private readonly webrtcBlock: WebRTCBlockService,
    private readonly systemDNS: SystemDNSService,
    private readonly ipLeakPrevention: IPLeakPreventionService,
    private readonly fingerprint: BrowserFingerprintService,
    options: FullProtectionToggleServiceOptions = {}
  ) {
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
  }

  async toggleProtection(
    enable: boolean,
    config?: FullProtectionConfig
  ): Promise<FullProtectionVerificationResult | null> {
    if (enable) {
      if (!config) {
        throw new Error("A protection configuration is required when enabling full protection.");
      }

      return this.activateFullProtection(config);
    }

    await this.deactivateFullProtection();
    return null;
  }

  async activateFullProtection(
    config: FullProtectionConfig
  ): Promise<FullProtectionVerificationResult> {
    await this.systemProxy.enableSystemProxy(config.torSocksPort);

    const localHttpProxyPort = this.systemProxy.getLocalHttpProxyPort();
    if (!localHttpProxyPort) {
      throw new Error("The system proxy bridge did not expose a loopback HTTP port.");
    }

    await this.runBestEffortPermissionStep(
      "configure protected browser proxy settings",
      async () => {
        await this.browserProxy.configureBrowsers({
          torSocksPort: config.torSocksPort,
          localHttpProxyPort
        });
      }
    );
    await this.runBestEffortPermissionStep("apply WebRTC protections", async () => {
      await this.webrtcBlock.blockWebRTC();
    });
    if (config.dnsOverTor) {
      await this.runBestEffortPermissionStep("force system DNS through Tor", async () => {
        await this.systemDNS.forceSystemDNS(
          config.torDnsPort ?? config.torSocksPort + 3
        );
      });
    }
    await this.runBestEffortPermissionStep("apply app proxy enforcement", async () => {
      await this.appProxy.forceAppProxy({
        enableKillSwitch: config.enableKillSwitch
      });
    });
    await this.runBestEffortPermissionStep("apply browser fingerprint hardening", async () => {
      await this.fingerprint.spoofBrowserFingerprint();
    });

    this.lastConfig = config;

    const verification = await this.verifyFullProtection();
    this.logger?.info(
      {
        workspaceId: config.workspaceId,
        passed: verification.passed
      },
      "Activated the full Private Mode protection stack"
    );
    return verification;
  }

  async deactivateFullProtection(): Promise<void> {
    await this.runBestEffortPermissionStep("restore browser fingerprint settings", async () => {
      await this.fingerprint.restoreFingerprint();
    });
    await this.runBestEffortPermissionStep("disable app proxy enforcement", async () => {
      await this.appProxy.disableAppProxy();
    });
    await this.runBestEffortPermissionStep("restore system DNS", async () => {
      await this.systemDNS.restoreDNS();
    });
    await this.runBestEffortPermissionStep("remove WebRTC protections", async () => {
      await this.webrtcBlock.unblockWebRTC();
    });
    await this.runBestEffortPermissionStep("restore protected browser settings", async () => {
      await this.browserProxy.restoreBrowsers();
    });
    await this.systemProxy.disableSystemProxy();
    this.lastConfig = null;
  }

  async verifyFullProtection(): Promise<FullProtectionVerificationResult> {
    const [
      systemProxy,
      browserProxy,
      appProxy,
      webrtc,
      dns,
      ipLeak,
      fingerprint
    ] = await Promise.all([
      this.verifyStep("system proxy", () => this.systemProxy.verifySystemProxy(), {
        passed: false,
        details: ["System proxy verification could not be completed."],
        bridgeListening: false,
        localHttpProxyPort: null,
        winInetConfigured: false,
        winHttpConfigured: false
      }),
      this.verifyStep("browser proxy", () => this.browserProxy.verifyBrowserProxy(), {
        passed: false,
        details: ["Protected browser verification could not be completed."],
        configuredBrowsers: [],
        shortcutPaths: []
      }),
      this.verifyStep("app proxy", () => this.appProxy.verifyAppProxy(), {
        passed: false,
        details: ["App proxy verification could not be completed."],
        enforcedPrograms: []
      }),
      this.verifyStep("WebRTC protection", () => this.webrtcBlock.verifyWebRTCBlocked(), {
        passed: false,
        details: ["WebRTC protection verification could not be completed."],
        configuredBrowsers: []
      }),
      this.verifyStep("system DNS", () => this.systemDNS.verifyDNS(), {
        passed: false,
        details: ["System DNS verification could not be completed."],
        torDnsPortReachable: false,
        protectedAdapters: []
      }),
      this.verifyStep("IP leak prevention", () => this.ipLeakPrevention.verifyIPLeaks(), {
        passed: false,
        details: ["IP leak prevention verification could not be completed."],
        activeRuleNames: []
      }),
      this.verifyStep("browser fingerprint hardening", () => this.fingerprint.verifyFingerprint(), {
        passed: false,
        details: ["Browser fingerprint verification could not be completed."],
        hardenedBrowsers: []
      })
    ]);

    const leaks: string[] = [];
    const advisories: string[] = [];

    if (!systemProxy.passed) {
      leaks.push("system_proxy_inactive");
    }

    if (!webrtc.passed) {
      leaks.push("webrtc_protection_incomplete");
    }

    if (!ipLeak.passed) {
      leaks.push("ip_leak_rules_inactive");
    }

    if (!browserProxy.passed) {
      advisories.push("browser_proxy_review_required");
    }

    if (!appProxy.passed) {
      advisories.push("app_proxy_enforcement_incomplete");
    }

    if (this.lastConfig?.dnsOverTor && !dns.passed) {
      advisories.push("system_dns_not_forced");
    }

    if (!fingerprint.passed) {
      advisories.push("fingerprint_hardening_incomplete");
    }

    return {
      passed:
        systemProxy.passed &&
        browserProxy.passed &&
        appProxy.passed &&
        webrtc.passed &&
        (!this.lastConfig?.dnsOverTor || dns.passed) &&
        ipLeak.passed &&
        fingerprint.passed,
      verifiedAt: this.now().toISOString(),
      leaks,
      advisories,
      results: {
        systemProxy,
        browserProxy,
        appProxy,
        webrtc,
        dns,
        ipLeak,
        fingerprint
      }
    };
  }

  private async verifyStep<T>(
    target: string,
    operation: () => Promise<T>,
    fallback: T
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logger?.warn(
        {
          target,
          error
        },
        "Falling back to a degraded Private Mode verification result because a protection probe failed"
      );
      return fallback;
    }
  }

  private async runBestEffortPermissionStep(
    action: string,
    operation: () => Promise<void>
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      if (!this.isAccessDeniedError(error)) {
        throw error;
      }

      this.logger?.warn(
        {
          action,
          error
        },
        "Skipped a best-effort Private Mode protection step because the current process does not have permission to change the operating system state"
      );
    }
  }

  private isAccessDeniedError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const code = "code" in error && typeof error.code === "string" ? error.code : "";
    const numericCode =
      "code" in error && typeof error.code === "number" ? error.code : null;
    const cmd = "cmd" in error && typeof error.cmd === "string" ? error.cmd : "";
    const stdout =
      "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
    const stderr =
      "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
    const message =
      "message" in error && typeof error.message === "string" ? error.message : "";
    const output = `${code}\n${stdout}\n${stderr}\n${message}`;

    if (
      /access is denied|permission denied|unauthorizedaccessexception|eacces|eperm/i.test(
        output
      )
    ) {
      return true;
    }

    return (
      numericCode === 1 &&
      /(?:^|\s)(?:Get|New|Remove)-NetFirewallRule(?:\s|$)/i.test(cmd)
    );
  }
}
