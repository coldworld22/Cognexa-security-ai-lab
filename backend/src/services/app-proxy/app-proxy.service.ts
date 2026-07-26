import { Logger } from "pino";

import {
  AppProxyVerificationResult
} from "../private-mode/full-protection.types";
import { IPLeakPreventionService } from "../ip-leak/ip-leak-prevention.service";
import { SystemProxyService } from "../system-proxy/system-proxy.service";

export interface AppProxyServiceOptions {
  logger?: Logger;
}

export class AppProxyService {
  private readonly logger?: Logger;

  constructor(
    private readonly systemProxy: SystemProxyService,
    private readonly ipLeakPrevention: IPLeakPreventionService,
    options: AppProxyServiceOptions = {}
  ) {
    this.logger = options.logger;
  }

  async forceAppProxy(options: {
    enableKillSwitch?: boolean;
    additionalProgramPaths?: string[];
  } = {}): Promise<void> {
    const localHttpProxyPort = this.systemProxy.getLocalHttpProxyPort();
    if (!localHttpProxyPort) {
      throw new Error("The system proxy bridge is not active, so app proxy enforcement cannot start.");
    }

    await this.ipLeakPrevention.preventIPLeaks({
      enableKillSwitch: options.enableKillSwitch,
      additionalProgramPaths: options.additionalProgramPaths
    });

    this.logger?.info(
      {
        localHttpProxyPort,
        protectedPrograms: this.ipLeakPrevention.getProtectedPrograms()
      },
      "Applied app-level proxy enforcement rules for Private Mode"
    );
  }

  async disableAppProxy(): Promise<void> {
    await this.ipLeakPrevention.restoreIPs();
  }

  async enableKillSwitch(additionalProgramPaths: string[] = []): Promise<void> {
    await this.forceAppProxy({
      enableKillSwitch: true,
      additionalProgramPaths
    });
  }

  async verifyAppProxy(): Promise<AppProxyVerificationResult> {
    const ruleStatus = await this.ipLeakPrevention.verifyIPLeaks();
    const systemProxyStatus = await this.systemProxy.verifySystemProxy();
    const details = [...ruleStatus.details];

    if (!systemProxyStatus.passed) {
      details.push("The loopback system proxy is not fully active, so firewall-only enforcement is insufficient.");
    }

    return {
      passed: ruleStatus.passed && systemProxyStatus.passed,
      details,
      enforcedPrograms: this.ipLeakPrevention.getProtectedPrograms()
    };
  }
}
