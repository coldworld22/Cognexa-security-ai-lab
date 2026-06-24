import { getDevModeConfig, type DevModeConfig } from "../../config/dev-mode.config";
import { AuthorizedTestingDevModeStatus } from "./authorized-security-testing.types";

export interface VerificationBypassDecision {
  active: boolean;
  reason:
    | "disabled_for_request"
    | "disabled_outside_development"
    | "disabled_by_environment"
    | "hostname_not_allowlisted"
    | "development_bypass_active";
  matchedDomain?: string;
}

export class VerificationBypassService {
  constructor(private readonly config: DevModeConfig = getDevModeConfig()) {}

  getStatus(): AuthorizedTestingDevModeStatus {
    return {
      environment: this.config.environment,
      available: this.config.enabled,
      bypassVerification: this.config.bypassVerification,
      requiresExplicitOptIn: false,
      allowedDomains: [...this.config.allowedDomains],
      message: this.buildStatusMessage()
    };
  }

  evaluate(url: URL, requested: boolean | undefined): VerificationBypassDecision {
    if (requested === false) {
      return {
        active: false,
        reason: "disabled_for_request"
      };
    }

    if (this.config.environment !== "development") {
      return {
        active: false,
        reason: "disabled_outside_development"
      };
    }

    if (!this.config.enabled || !this.config.bypassVerification) {
      return {
        active: false,
        reason: "disabled_by_environment"
      };
    }

    const matchedDomain = this.matchAllowedDomain(url.hostname);
    if (!matchedDomain) {
      return {
        active: false,
        reason: "hostname_not_allowlisted"
      };
    }

    return {
      active: true,
      reason: "development_bypass_active",
      matchedDomain
    };
  }

  private buildStatusMessage(): string {
    if (this.config.environment !== "development") {
      return "Developer verification bypass is unavailable outside development mode.";
    }

    if (!this.config.enabled || !this.config.bypassVerification) {
      return "Developer verification bypass is disabled. Set ENABLE_VERIFICATION_BYPASS=true to enable the development fast path.";
    }

    return "Developer verification bypass is active for allowlisted development hostnames. Manual domain verification is optional in development unless you turn the bypass off.";
  }

  private matchAllowedDomain(hostname: string): string | undefined {
    const normalizedHostname = hostname.trim().toLowerCase();
    if (!normalizedHostname) {
      return undefined;
    }

    for (const pattern of this.config.allowedDomains) {
      const normalizedPattern = pattern.trim().toLowerCase();
      if (!normalizedPattern) {
        continue;
      }

      if (!normalizedPattern.startsWith("*.")) {
        if (normalizedHostname === normalizedPattern) {
          return normalizedPattern;
        }

        continue;
      }

      const suffix = normalizedPattern.slice(1);
      const bareDomain = normalizedPattern.slice(2);
      if (
        normalizedHostname === bareDomain ||
        normalizedHostname.endsWith(suffix)
      ) {
        return normalizedPattern;
      }
    }

    return undefined;
  }
}
