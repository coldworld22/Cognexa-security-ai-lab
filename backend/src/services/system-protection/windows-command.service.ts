import { execFile } from "child_process";
import { promisify } from "util";

import { Logger } from "pino";

const execFileAsync = promisify(execFile);
const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy"
] as const;

export interface WindowsCommandServiceOptions {
  logger?: Logger;
  platform?: NodeJS.Platform;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export class WindowsCommandService {
  private readonly logger?: Logger;
  private readonly platform: NodeJS.Platform;

  constructor(options: WindowsCommandServiceOptions = {}) {
    this.logger = options.logger;
    this.platform = options.platform ?? process.platform;
  }

  isWindows(): boolean {
    return this.platform === "win32";
  }

  async runPowerShell(
    script: string,
    options: {
      clearProxyEnv?: boolean;
      maxBuffer?: number;
    } = {}
  ): Promise<CommandResult> {
    return this.runCommand(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script
      ],
      options
    );
  }

  async runCommand(
    file: string,
    args: string[],
    options: {
      clearProxyEnv?: boolean;
      env?: NodeJS.ProcessEnv;
      maxBuffer?: number;
    } = {}
  ): Promise<CommandResult> {
    const env = {
      ...process.env,
      ...(options.env ?? {})
    };

    if (options.clearProxyEnv) {
      for (const key of PROXY_ENV_KEYS) {
        delete env[key];
      }
    }

    try {
      const result = await execFileAsync(file, args, {
        env,
        windowsHide: true,
        maxBuffer: options.maxBuffer ?? 1024 * 1024
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr
      };
    } catch (error) {
      this.logger?.warn(
        {
          error,
          file,
          args
        },
        "Windows command failed"
      );
      throw error;
    }
  }

  toPowerShellLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  async readRegistryValue(
    path: string,
    name: string
  ): Promise<string | null> {
    const { stdout } = await this.runPowerShell(
      "$path = " +
        this.toPowerShellLiteral(path) +
        "; $name = " +
        this.toPowerShellLiteral(name) +
        "; " +
        "if (-not (Test-Path -LiteralPath $path)) { [pscustomobject]@{ hasValue = $false; value = $null } | ConvertTo-Json -Compress; exit 0 }; " +
        "try { $value = Get-ItemPropertyValue -LiteralPath $path -Name $name -ErrorAction Stop; [pscustomobject]@{ hasValue = $true; value = if ($null -eq $value) { $null } else { [string]$value } } | ConvertTo-Json -Compress } " +
        "catch { [pscustomobject]@{ hasValue = $false; value = $null } | ConvertTo-Json -Compress }"
    );

    const payload = JSON.parse(stdout.trim()) as {
      hasValue?: boolean;
      value?: string | null;
    };

    return payload.hasValue ? payload.value ?? null : null;
  }

  async setRegistryValue(options: {
    path: string;
    name: string;
    value: string | number;
    type: "String" | "DWord";
  }): Promise<void> {
    await this.runPowerShell(
      "$path = " +
        this.toPowerShellLiteral(options.path) +
        "; " +
        "New-Item -Path $path -Force | Out-Null; " +
        "Set-ItemProperty -Path $path -Name " +
        this.toPowerShellLiteral(options.name) +
        " -Type " +
        options.type +
        " -Value " +
        (typeof options.value === "number"
          ? String(options.value)
          : this.toPowerShellLiteral(options.value))
    );
  }

  async removeRegistryValue(path: string, name: string): Promise<void> {
    await this.runPowerShell(
      "$path = " +
        this.toPowerShellLiteral(path) +
        "; " +
        "if (Test-Path -LiteralPath $path) { Remove-ItemProperty -Path $path -Name " +
        this.toPowerShellLiteral(name) +
        " -ErrorAction SilentlyContinue }"
    );
  }
}
