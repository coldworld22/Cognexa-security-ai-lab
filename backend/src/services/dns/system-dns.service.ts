import { Socket } from "net";

import { Logger } from "pino";

import {
  DNSVerificationResult
} from "../private-mode/full-protection.types";
import { WindowsCommandService } from "../system-protection/windows-command.service";

interface AdapterDnsState {
  interfaceAlias: string;
  serverAddresses: string[];
}

export interface SystemDNSServiceOptions {
  logger?: Logger;
  platform?: NodeJS.Platform;
  windowsCommands?: WindowsCommandService;
}

export class SystemDNSService {
  private readonly logger?: Logger;
  private readonly platform: NodeJS.Platform;
  private readonly windowsCommands: WindowsCommandService;

  private originalAdapters: AdapterDnsState[] | null = null;
  private protectedAdapters: string[] = [];
  private torDnsPortReachable = false;

  constructor(options: SystemDNSServiceOptions = {}) {
    this.logger = options.logger;
    this.platform = options.platform ?? process.platform;
    this.windowsCommands =
      options.windowsCommands ??
      new WindowsCommandService({
        logger: options.logger,
        platform: this.platform
      });
  }

  async forceSystemDNS(torDnsPort: number): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    this.torDnsPortReachable = await this.isLocalPortReachable(torDnsPort);
    if (!this.torDnsPortReachable) {
      this.logger?.warn(
        {
          torDnsPort
        },
        "Skipping adapter DNS rewrites because the local Tor DNS port is unreachable"
      );
      this.protectedAdapters = [];
      return;
    }

    if (!this.originalAdapters) {
      this.originalAdapters = await this.readAdapterDnsState();
    }

    this.protectedAdapters = this.originalAdapters.map(
      (adapter) => adapter.interfaceAlias
    );

    for (const adapter of this.protectedAdapters) {
      await this.windowsCommands.runPowerShell(
        `Set-DnsClientServerAddress -InterfaceAlias ${this.windowsCommands.toPowerShellLiteral(
          adapter
        )} -ServerAddresses @('127.0.0.1')`
      );
    }
  }

  async restoreDNS(): Promise<void> {
    if (this.platform !== "win32" || !this.originalAdapters) {
      return;
    }

    for (const adapter of this.originalAdapters) {
      const serverAddresses =
        adapter.serverAddresses.length > 0
          ? `@(${adapter.serverAddresses
              .map((value) => this.windowsCommands.toPowerShellLiteral(value))
              .join(",")})`
          : "@()";
      await this.windowsCommands.runPowerShell(
        `Set-DnsClientServerAddress -InterfaceAlias ${this.windowsCommands.toPowerShellLiteral(
          adapter.interfaceAlias
        )} -ServerAddresses ${serverAddresses}`
      );
    }

    this.originalAdapters = null;
    this.protectedAdapters = [];
    this.torDnsPortReachable = false;
  }

  async verifyDNS(): Promise<DNSVerificationResult> {
    const details: string[] = [];
    const currentAdapters =
      this.platform === "win32" ? await this.readAdapterDnsState() : [];
    const protectedAdapters = currentAdapters
      .filter((adapter) => adapter.serverAddresses.length === 1)
      .filter((adapter) => adapter.serverAddresses[0] === "127.0.0.1")
      .map((adapter) => adapter.interfaceAlias);

    if (!this.torDnsPortReachable) {
      details.push("The local Tor DNS port is unavailable, so adapter DNS could not be forced.");
    }

    if (this.torDnsPortReachable && protectedAdapters.length === 0) {
      details.push("No active network adapter is pinned to 127.0.0.1 for DNS.");
    }

    if (details.length === 0) {
      details.push("Active adapters resolve DNS through the local Tor DNS listener.");
    }

    return {
      passed: this.torDnsPortReachable && protectedAdapters.length > 0,
      details,
      torDnsPortReachable: this.torDnsPortReachable,
      protectedAdapters
    };
  }

  private async readAdapterDnsState(): Promise<AdapterDnsState[]> {
    const { stdout } = await this.windowsCommands.runPowerShell(
      "Get-DnsClientServerAddress -AddressFamily IPv4 | " +
        "Where-Object { $_.ServerAddresses -and $_.InterfaceAlias } | " +
        "Select-Object InterfaceAlias, ServerAddresses | ConvertTo-Json -Compress -Depth 4"
    );

    if (!stdout.trim()) {
      return [];
    }

    const payload = JSON.parse(stdout.trim()) as
      | AdapterDnsState
      | AdapterDnsState[];
    return Array.isArray(payload) ? payload : [payload];
  }

  private async isLocalPortReachable(port: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = new Socket();
      let settled = false;

      const finish = (value: boolean) => {
        if (settled) {
          return;
        }

        settled = true;
        socket.destroy();
        resolve(value);
      };

      socket.setTimeout(750);
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
      socket.connect(port, "127.0.0.1", () => finish(true));
    });
  }
}
