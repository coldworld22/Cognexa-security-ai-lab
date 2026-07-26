import { Logger } from "pino";

import {
  SystemProxyVerificationResult
} from "../private-mode/full-protection.types";
import { WindowsCommandService } from "../system-protection/windows-command.service";
import {
  TorHttpProxyBridgeService,
  TorHttpProxyBridgeState
} from "./tor-http-proxy-bridge.service";

interface WinInetProxyState {
  enabled: boolean;
  server: string | null;
  override: string | null;
  autoConfigUrl: string | null;
  autoDetect: boolean;
}

interface WinHttpProxyState {
  enabled: boolean;
  server: string | null;
  bypassList: string | null;
}

export interface SystemProxyServiceOptions {
  logger?: Logger;
  now?: () => Date;
  platform?: NodeJS.Platform;
  preferredLocalProxyPort?: number;
  bridge?: TorHttpProxyBridgeService;
  windowsCommands?: WindowsCommandService;
  readWinInetState?: () => Promise<WinInetProxyState | null>;
  writeWinInetState?: (state: WinInetProxyState) => Promise<void>;
  readWinHttpState?: () => Promise<WinHttpProxyState | null>;
  writeWinHttpState?: (state: WinHttpProxyState) => Promise<void>;
}

export class SystemProxyService {
  private readonly logger?: Logger;
  private readonly now: () => Date;
  private readonly platform: NodeJS.Platform;
  private readonly preferredLocalProxyPort: number;
  private readonly bridge: TorHttpProxyBridgeService;
  private readonly windowsCommands: WindowsCommandService;
  private readonly readWinInetStateImpl?: () => Promise<WinInetProxyState | null>;
  private readonly writeWinInetStateImpl?: (state: WinInetProxyState) => Promise<void>;
  private readonly readWinHttpStateImpl?: () => Promise<WinHttpProxyState | null>;
  private readonly writeWinHttpStateImpl?: (state: WinHttpProxyState) => Promise<void>;

  private originalWinInetState: WinInetProxyState | null | undefined;
  private originalWinHttpState: WinHttpProxyState | null | undefined;
  private activeBridgeState: TorHttpProxyBridgeState | null = null;
  private activeTorSocksPort: number | null = null;

  constructor(options: SystemProxyServiceOptions = {}) {
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
    this.platform = options.platform ?? process.platform;
    this.preferredLocalProxyPort = options.preferredLocalProxyPort ?? 9080;
    this.bridge =
      options.bridge ??
      new TorHttpProxyBridgeService({
        logger: options.logger,
        now: options.now
      });
    this.windowsCommands =
      options.windowsCommands ??
      new WindowsCommandService({
        logger: options.logger,
        platform: this.platform
      });
    this.readWinInetStateImpl = options.readWinInetState;
    this.writeWinInetStateImpl = options.writeWinInetState;
    this.readWinHttpStateImpl = options.readWinHttpState;
    this.writeWinHttpStateImpl = options.writeWinHttpState;
  }

  getLocalHttpProxyPort(): number | null {
    return this.activeBridgeState?.listenPort ?? null;
  }

  async enableSystemProxy(torSocksPort: number): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    if (this.originalWinInetState === undefined) {
      this.originalWinInetState = await this.readWinInetState();
    }

    if (this.originalWinHttpState === undefined) {
      this.originalWinHttpState = await this.readWinHttpState();
    }

    this.activeBridgeState = await this.bridge.start({
      torSocksPort,
      preferredPort: this.preferredLocalProxyPort
    });
    this.activeTorSocksPort = torSocksPort;

    const localProxyUrl = `http=127.0.0.1:${this.activeBridgeState.listenPort};https=127.0.0.1:${this.activeBridgeState.listenPort};socks=127.0.0.1:${torSocksPort}`;
    await this.writeWinInetState({
      enabled: true,
      server: localProxyUrl,
      override: "localhost;127.*;<local>",
      autoConfigUrl: null,
      autoDetect: false
    });
    await this.tryWriteWinHttpState(
      {
        enabled: true,
        server: `http=127.0.0.1:${this.activeBridgeState.listenPort};https=127.0.0.1:${this.activeBridgeState.listenPort}`,
        bypassList: "localhost;127.*;<local>"
      },
      "Skipping WinHTTP proxy enforcement because the current process does not have permission to update it."
    );

    this.logger?.info(
      {
        torSocksPort,
        localHttpProxyPort: this.activeBridgeState.listenPort
      },
      "Enabled the Windows system proxy stack for Private Mode"
    );
  }

  async disableSystemProxy(): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    if (this.originalWinInetState !== undefined) {
      await this.writeWinInetState(
        this.originalWinInetState ?? {
          enabled: false,
          server: null,
          override: null,
          autoConfigUrl: null,
          autoDetect: false
        }
      );
      this.originalWinInetState = undefined;
    }

    if (this.originalWinHttpState !== undefined) {
      await this.tryWriteWinHttpState(
        this.originalWinHttpState ?? {
          enabled: false,
          server: null,
          bypassList: null
        },
        "Skipping WinHTTP proxy restoration because the current process does not have permission to update it."
      );
      this.originalWinHttpState = undefined;
    }

    this.activeBridgeState = null;
    this.activeTorSocksPort = null;
    await this.bridge.stop();
  }

  async verifySystemProxy(): Promise<SystemProxyVerificationResult> {
    const details: string[] = [];
    const winInetState = await this.readWinInetState();
    const winHttpState = await this.readWinHttpState();
    const bridgeState = this.bridge.getState();
    const localHttpProxyPort = bridgeState?.listenPort ?? null;
    const expectedWinInetServer =
      bridgeState && this.activeTorSocksPort
        ? `http=127.0.0.1:${bridgeState.listenPort};https=127.0.0.1:${bridgeState.listenPort};socks=127.0.0.1:${this.activeTorSocksPort}`
        : null;
    const expectedWinHttpServer =
      bridgeState
        ? `http=127.0.0.1:${bridgeState.listenPort};https=127.0.0.1:${bridgeState.listenPort}`
        : null;
    const bridgeListening = Boolean(bridgeState);
    const winInetConfigured = Boolean(
      bridgeState &&
        winInetState?.enabled &&
        winInetState.server === expectedWinInetServer &&
        winInetState.override === "localhost;127.*;<local>"
    );
    const winHttpConfigured = Boolean(
      bridgeState &&
        winHttpState?.enabled &&
        winHttpState.server === expectedWinHttpServer
    );

    if (!bridgeListening) {
      details.push("The loopback HTTP proxy bridge is not running.");
    }

    if (!winInetConfigured) {
      details.push("WinINET proxy settings are not pointing at the protected loopback proxy.");
    }

    if (!winHttpConfigured) {
      details.push("WinHTTP proxy settings are not pointing at the protected loopback proxy.");
    }

    if (details.length === 0) {
      details.push("WinINET and WinHTTP are both pinned to the loopback Tor proxy bridge.");
    }

    return {
      passed: bridgeListening && winInetConfigured && winHttpConfigured,
      details,
      bridgeListening,
      localHttpProxyPort,
      winInetConfigured,
      winHttpConfigured
    };
  }

  private async readWinInetState(): Promise<WinInetProxyState | null> {
    if (this.readWinInetStateImpl) {
      return this.readWinInetStateImpl();
    }

    if (this.platform !== "win32") {
      return null;
    }

    const { stdout } = await this.windowsCommands.runPowerShell(
      "$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'; " +
        "$props = Get-ItemProperty -Path $path; " +
        "[pscustomobject]@{ " +
        "enabled = [bool]($props.ProxyEnable -eq 1); " +
        "server = if ($null -ne $props.ProxyServer -and [string]$props.ProxyServer -ne '') { [string]$props.ProxyServer } else { $null }; " +
        "override = if ($null -ne $props.ProxyOverride -and [string]$props.ProxyOverride -ne '') { [string]$props.ProxyOverride } else { $null }; " +
        "autoConfigUrl = if ($null -ne $props.AutoConfigURL -and [string]$props.AutoConfigURL -ne '') { [string]$props.AutoConfigURL } else { $null }; " +
        "autoDetect = [bool]($props.AutoDetect -eq 1) " +
        "} | ConvertTo-Json -Compress"
    );

    return JSON.parse(stdout.trim()) as WinInetProxyState;
  }

  private async writeWinInetState(state: WinInetProxyState): Promise<void> {
    if (this.writeWinInetStateImpl) {
      await this.writeWinInetStateImpl(state);
      return;
    }

    if (this.platform !== "win32") {
      return;
    }

    const script = [
      "$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'",
      `Set-ItemProperty -Path $path -Name ProxyEnable -Type DWord -Value ${state.enabled ? 1 : 0}`,
      `Set-ItemProperty -Path $path -Name AutoDetect -Type DWord -Value ${state.autoDetect ? 1 : 0}`,
      this.buildRegistryWriteStatement("ProxyServer", state.server),
      this.buildRegistryWriteStatement("ProxyOverride", state.override),
      this.buildRegistryWriteStatement("AutoConfigURL", state.autoConfigUrl),
      "if (-not ('WinInet.NativeMethods' -as [type])) { Add-Type -Namespace WinInet -Name NativeMethods -MemberDefinition '[System.Runtime.InteropServices.DllImport(\"wininet.dll\", SetLastError = true)] public static extern bool InternetSetOption(System.IntPtr hInternet, int dwOption, System.IntPtr lpBuffer, int dwBufferLength);' }",
      "[WinInet.NativeMethods]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null",
      "[WinInet.NativeMethods]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null"
    ].join("; ");

    await this.windowsCommands.runPowerShell(script);
  }

  private async readWinHttpState(): Promise<WinHttpProxyState | null> {
    if (this.readWinHttpStateImpl) {
      return this.readWinHttpStateImpl();
    }

    if (this.platform !== "win32") {
      return null;
    }

    const { stdout } = await this.windowsCommands.runCommand("netsh", [
      "winhttp",
      "show",
      "proxy"
    ]);

    if (/Direct access \(no proxy server\)\./i.test(stdout)) {
      return {
        enabled: false,
        server: null,
        bypassList: null
      };
    }

    const proxyMatch = stdout.match(/Proxy Server\(s\)\s*:\s*(.+)/i);
    const bypassMatch = stdout.match(/Bypass List\s*:\s*(.+)/i);

    return {
      enabled: Boolean(proxyMatch?.[1]?.trim()),
      server: proxyMatch?.[1]?.trim() ?? null,
      bypassList: bypassMatch?.[1]?.trim() ?? null
    };
  }

  private async writeWinHttpState(state: WinHttpProxyState): Promise<void> {
    if (this.writeWinHttpStateImpl) {
      await this.writeWinHttpStateImpl(state);
      return;
    }

    if (this.platform !== "win32") {
      return;
    }

    if (!state.enabled || !state.server) {
      await this.windowsCommands.runCommand("netsh", ["winhttp", "reset", "proxy"]);
      return;
    }

    const args = [
      "winhttp",
      "set",
      "proxy",
      `proxy-server=${state.server}`
    ];
    if (state.bypassList) {
      args.push(`bypass-list=${state.bypassList}`);
    }

    await this.windowsCommands.runCommand("netsh", args);
  }

  private async tryWriteWinHttpState(
    state: WinHttpProxyState,
    warningMessage: string
  ): Promise<void> {
    try {
      await this.writeWinHttpState(state);
    } catch (error) {
      if (!this.isAccessDeniedCommandError(error)) {
        throw error;
      }

      this.logger?.warn(
        {
          error
        },
        warningMessage
      );
    }
  }

  private isAccessDeniedCommandError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const stdout =
      "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
    const stderr =
      "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
    const message =
      "message" in error && typeof error.message === "string" ? error.message : "";
    const output = `${stdout}\n${stderr}\n${message}`;

    return /access is denied/i.test(output);
  }

  private buildRegistryWriteStatement(
    name: string,
    value: string | null
  ): string {
    if (value === null || value.trim() === "") {
      return `Remove-ItemProperty -Path $path -Name ${this.windowsCommands.toPowerShellLiteral(
        name
      )} -ErrorAction SilentlyContinue`;
    }

    return `Set-ItemProperty -Path $path -Name ${this.windowsCommands.toPowerShellLiteral(
      name
    )} -Value ${this.windowsCommands.toPowerShellLiteral(value)}`;
  }
}
