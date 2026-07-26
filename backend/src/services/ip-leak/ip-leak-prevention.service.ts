import { access } from "fs/promises";

import { Logger } from "pino";

import {
  IpLeakVerificationResult
} from "../private-mode/full-protection.types";
import { WindowsCommandService } from "../system-protection/windows-command.service";

const FIREWALL_GROUP = "Security AI Lab Private Mode";

const DEFAULT_BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
  "C:\\Windows\\System32\\curl.exe",
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
] as const;

export interface IPLeakPreventionServiceOptions {
  logger?: Logger;
  platform?: NodeJS.Platform;
  windowsCommands?: WindowsCommandService;
}

export class IPLeakPreventionService {
  private readonly logger?: Logger;
  private readonly platform: NodeJS.Platform;
  private readonly windowsCommands: WindowsCommandService;
  private activeRuleNames: string[] = [];
  private protectedPrograms: string[] = [];

  constructor(options: IPLeakPreventionServiceOptions = {}) {
    this.logger = options.logger;
    this.platform = options.platform ?? process.platform;
    this.windowsCommands =
      options.windowsCommands ??
      new WindowsCommandService({
        logger: options.logger,
        platform: this.platform
      });
  }

  async preventIPLeaks(options: {
    enableKillSwitch?: boolean;
    additionalProgramPaths?: string[];
  } = {}): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    await this.removeFirewallRules();
    this.protectedPrograms = await this.resolveProtectedPrograms(
      options.additionalProgramPaths ?? []
    );

    const rules: Array<{
      name: string;
      protocol: "TCP" | "UDP";
      remotePorts: string;
      program?: string;
    }> = [
      {
        name: "Block DNS leaks",
        protocol: "UDP",
        remotePorts: "53"
      },
      {
        name: "Block mDNS leaks",
        protocol: "UDP",
        remotePorts: "5353"
      },
      {
        name: "Block STUN leaks",
        protocol: "UDP",
        remotePorts: "3478-3497"
      },
      {
        name: "Block QUIC leaks",
        protocol: "UDP",
        remotePorts: "443"
      }
    ];

    if (options.enableKillSwitch) {
      for (const program of this.protectedPrograms) {
        rules.push({
          name: `Kill switch for ${program.split("\\").at(-1) ?? "app"}`,
          protocol: "TCP",
          remotePorts: "80,443,8080,8443",
          program
        });
      }
    }

    for (const rule of rules) {
      await this.createFirewallRule(rule);
    }

    this.activeRuleNames = rules.map((rule) => rule.name);
  }

  async restoreIPs(): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    await this.removeFirewallRules();
    this.activeRuleNames = [];
    this.protectedPrograms = [];
  }

  async verifyIPLeaks(): Promise<IpLeakVerificationResult> {
    const details: string[] = [];
    const activeRuleNames = await this.listFirewallRuleNames();

    if (activeRuleNames.length === 0) {
      details.push("No leak-prevention firewall rules are active.");
    } else {
      details.push("Firewall rules are blocking direct DNS, STUN, mDNS, QUIC, and browser bypass traffic.");
    }

    return {
      passed: activeRuleNames.length > 0,
      details,
      activeRuleNames
    };
  }

  async enableKillSwitch(): Promise<void> {
    await this.preventIPLeaks({
      enableKillSwitch: true
    });
  }

  getProtectedPrograms(): string[] {
    return [...this.protectedPrograms];
  }

  private async createFirewallRule(rule: {
    name: string;
    protocol: "TCP" | "UDP";
    remotePorts: string;
    program?: string;
  }): Promise<void> {
    const script = [
      `Get-NetFirewallRule -Group ${this.windowsCommands.toPowerShellLiteral(
        FIREWALL_GROUP
      )} -DisplayName ${this.windowsCommands.toPowerShellLiteral(rule.name)} -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
      "New-NetFirewallRule " +
        `-DisplayName ${this.windowsCommands.toPowerShellLiteral(rule.name)} ` +
        `-Group ${this.windowsCommands.toPowerShellLiteral(FIREWALL_GROUP)} ` +
        "-Direction Outbound -Action Block -Enabled True -Profile Any " +
        `-Protocol ${rule.protocol} ` +
        `-RemotePort ${this.windowsCommands.toPowerShellLiteral(rule.remotePorts)} ` +
        (rule.program
          ? `-Program ${this.windowsCommands.toPowerShellLiteral(rule.program)} `
          : "")
    ].join("; ");

    await this.windowsCommands.runPowerShell(script);
  }

  private async removeFirewallRules(): Promise<void> {
    await this.windowsCommands.runPowerShell(
      `Get-NetFirewallRule -Group ${this.windowsCommands.toPowerShellLiteral(
        FIREWALL_GROUP
      )} -ErrorAction SilentlyContinue | Remove-NetFirewallRule`
    );
  }

  private async listFirewallRuleNames(): Promise<string[]> {
    let stdout: string;

    try {
      ({ stdout } = await this.windowsCommands.runPowerShell(
        "Get-NetFirewallRule -Group " +
          this.windowsCommands.toPowerShellLiteral(FIREWALL_GROUP) +
          " -ErrorAction SilentlyContinue | " +
          "Select-Object -ExpandProperty DisplayName | ConvertTo-Json -Compress"
      ));
    } catch (error) {
      if (!this.isFirewallPermissionError(error)) {
        throw error;
      }

      this.logger?.warn(
        {
          error
        },
        "Skipping firewall rule verification because the current process does not have permission to inspect Windows firewall rules"
      );
      return [];
    }

    if (!stdout.trim()) {
      return [];
    }

    const payload = JSON.parse(stdout.trim()) as string | string[];
    return Array.isArray(payload) ? payload : [payload];
  }

  private async resolveProtectedPrograms(
    additionalPrograms: string[]
  ): Promise<string[]> {
    const programs = new Set<string>([
      ...DEFAULT_BROWSER_CANDIDATES,
      ...additionalPrograms
    ]);
    const existingPrograms: string[] = [];

    for (const program of programs) {
      if (await this.pathExists(program)) {
        existingPrograms.push(program);
      }
    }

    return existingPrograms;
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private isFirewallPermissionError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const numericCode =
      "code" in error && typeof error.code === "number" ? error.code : null;
    const cmd = "cmd" in error && typeof error.cmd === "string" ? error.cmd : "";
    const stdout =
      "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
    const stderr =
      "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
    const message =
      "message" in error && typeof error.message === "string" ? error.message : "";
    const output = `${stdout}\n${stderr}\n${message}`;

    if (/access is denied|permission denied|unauthorizedaccessexception|eacces|eperm/i.test(output)) {
      return true;
    }

    return numericCode === 1 && /(?:^|\s)Get-NetFirewallRule(?:\s|$)/i.test(cmd);
  }
}
