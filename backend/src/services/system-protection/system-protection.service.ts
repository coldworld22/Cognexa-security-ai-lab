import { Logger } from "pino";

import { env } from "../../config/env";
import { PolicyCategory } from "../../policy/policy.types";
import {
  FullProtectionVerificationResult
} from "../private-mode/full-protection.types";
import { CloakingService } from "../private-mode/cloaking.service";
import {
  CloakingConfig,
  CloakingSession,
  CloakingVerificationResult,
  PrivateModeOutboundStrategy,
  TlsFingerprintProfile
} from "../private-mode/private-mode.types";
import { FullProtectionToggleService } from "../toggle/full-protection-toggle.service";

const DEFAULT_ENABLED_CATEGORIES: PolicyCategory[] = [
  "security_research",
  "vulnerability_analysis",
  "external_url_access"
];

export interface SystemProtectionActivationInput {
  workspaceId: string;
  outboundStrategy?: PrivateModeOutboundStrategy;
  torControlPort?: number;
  torSocksPort?: number;
  dnsOverTor?: boolean;
  exitGeographyPreference?: string[];
  circuitRotationInterval?: number;
  tlsFingerprintProfile?: TlsFingerprintProfile;
  requestTimingJitter?: number;
  enabledCategories?: PolicyCategory[];
}

export interface SystemProtectionStatus {
  active: boolean;
  protectionLevel: "inactive" | "degraded" | "protected";
  routeVerified: boolean;
  transportSecure: boolean;
  config: CloakingConfig;
  session: CloakingSession | null;
  cloakingVerification: CloakingVerificationResult | null;
  fullProtectionVerification: FullProtectionVerificationResult | null;
  advisories: string[];
}

export interface SystemProtectionServiceOptions {
  logger?: Logger;
}

export class SystemProtectionService {
  private readonly logger?: Logger;

  constructor(
    private readonly privateMode: CloakingService,
    private readonly fullProtectionToggle: FullProtectionToggleService,
    options: SystemProtectionServiceOptions = {}
  ) {
    this.logger = options.logger;
  }

  async activateProtection(
    input: SystemProtectionActivationInput
  ): Promise<SystemProtectionStatus> {
    const currentConfig = await this.privateMode.getConfig(input.workspaceId);
    const outboundStrategy = input.outboundStrategy ?? currentConfig.outboundStrategy;

    if (outboundStrategy === "vpn-chain") {
      throw new Error(
        "System protection requires a Tor-backed strategy. vpn-chain still depends on external tunnel plumbing outside the app."
      );
    }

    const nextConfig: CloakingConfig = {
      ...currentConfig,
      workspaceId: input.workspaceId,
      mode: "cloaked",
      outboundStrategy,
      torControlPort: input.torControlPort ?? currentConfig.torControlPort,
      torSocksPort: input.torSocksPort ?? currentConfig.torSocksPort,
      dnsOverTor: input.dnsOverTor ?? currentConfig.dnsOverTor ?? true,
      exitGeographyPreference:
        input.exitGeographyPreference ?? currentConfig.exitGeographyPreference,
      circuitRotationInterval:
        input.circuitRotationInterval ?? currentConfig.circuitRotationInterval,
      tlsFingerprintProfile:
        input.tlsFingerprintProfile ?? currentConfig.tlsFingerprintProfile,
      requestTimingJitter:
        input.requestTimingJitter ?? currentConfig.requestTimingJitter,
      enabledCategories:
        input.enabledCategories ??
        (currentConfig.enabledCategories.length > 0
          ? currentConfig.enabledCategories
          : DEFAULT_ENABLED_CATEGORIES)
    };

    await this.privateMode.activatePrivateMode(input.workspaceId, nextConfig);
    return this.getProtectionStatus(input.workspaceId);
  }

  async deactivateProtection(workspaceId: string): Promise<SystemProtectionStatus> {
    await this.privateMode.deactivateWorkspace(workspaceId);
    return this.getProtectionStatus(workspaceId);
  }

  async getProtectionStatus(workspaceId: string): Promise<SystemProtectionStatus> {
    const [config, session] = await Promise.all([
      this.privateMode.getConfig(workspaceId),
      this.privateMode.getActiveSession(workspaceId)
    ]);

    if (!session) {
      return {
        active: false,
        protectionLevel: "inactive",
        routeVerified: false,
        transportSecure: env.HTTPS_ENABLED,
        config,
        session: null,
        cloakingVerification: null,
        fullProtectionVerification: null,
        advisories: []
      };
    }

    const [cloakingResult, fullProtectionResult] = await Promise.allSettled([
      this.privateMode.verifyCloaking(workspaceId),
      this.fullProtectionToggle.verifyFullProtection()
    ]);

    const advisories: string[] = [];
    let cloakingVerification: CloakingVerificationResult | null = null;
    let fullProtectionVerification: FullProtectionVerificationResult | null = null;

    if (cloakingResult.status === "fulfilled") {
      cloakingVerification = cloakingResult.value;
      advisories.push(...cloakingResult.value.advisories);
    } else {
      advisories.push("cloaking_verification_unavailable");
      this.logger?.warn(
        {
          error: cloakingResult.reason,
          workspaceId
        },
        "Failed to verify the cloaked route while building the protection status"
      );
    }

    if (fullProtectionResult.status === "fulfilled") {
      fullProtectionVerification = fullProtectionResult.value;
      advisories.push(...fullProtectionResult.value.advisories);
    } else {
      advisories.push("full_protection_verification_unavailable");
      this.logger?.warn(
        {
          error: fullProtectionResult.reason,
          workspaceId
        },
        "Failed to verify the Windows protection stack while building the protection status"
      );
    }

    const routeVerified = Boolean(
      cloakingVerification?.isCloaked && cloakingVerification.transportVerified
    );
    const fullyProtected = Boolean(routeVerified && fullProtectionVerification?.passed);

    return {
      active: true,
      protectionLevel: fullyProtected ? "protected" : "degraded",
      routeVerified,
      transportSecure: env.HTTPS_ENABLED,
      config,
      session,
      cloakingVerification,
      fullProtectionVerification,
      advisories: this.uniqueStrings(advisories)
    };
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }
}
