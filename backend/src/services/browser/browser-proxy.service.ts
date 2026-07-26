import { access, mkdir, readFile, rm, writeFile } from "fs/promises";
import * as path from "path";

import { Logger } from "pino";

import {
  BrowserProxyVerificationResult
} from "../private-mode/full-protection.types";
import { WindowsCommandService } from "../system-protection/windows-command.service";
import { mergeFirefoxUserPreferences } from "./firefox-user-preferences";

const CHROME_POLICY_PATH = "HKCU:\\Software\\Policies\\Google\\Chrome";
const EDGE_POLICY_PATH = "HKCU:\\Software\\Policies\\Microsoft\\Edge";

interface BrowserDescriptor {
  id: "chrome" | "edge" | "firefox";
  shortcutName: string;
  executableCandidates: string[];
}

const DEFAULT_BROWSERS: BrowserDescriptor[] = [
  {
    id: "chrome",
    shortcutName: "Chrome - Protected.lnk",
    executableCandidates: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    ]
  },
  {
    id: "edge",
    shortcutName: "Edge - Protected.lnk",
    executableCandidates: [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
    ]
  },
  {
    id: "firefox",
    shortcutName: "Firefox - Protected.lnk",
    executableCandidates: ["C:\\Program Files\\Mozilla Firefox\\firefox.exe"]
  }
];

export interface BrowserProxyServiceOptions {
  logger?: Logger;
  platform?: NodeJS.Platform;
  windowsCommands?: WindowsCommandService;
  localAppDataDir?: string;
  desktopDir?: string;
  userProfileDir?: string;
  browsers?: BrowserDescriptor[];
}

export class BrowserProxyService {
  private readonly logger?: Logger;
  private readonly platform: NodeJS.Platform;
  private readonly windowsCommands: WindowsCommandService;
  private readonly localAppDataDir: string;
  private readonly desktopDir: string;
  private readonly userProfileDir: string;
  private readonly browsers: BrowserDescriptor[];
  private readonly originalRegistryValues = new Map<string, string | null>();
  private readonly originalFiles = new Map<string, string | null>();
  private readonly createdShortcuts = new Set<string>();
  private readonly configuredBrowsers = new Set<string>();

  constructor(options: BrowserProxyServiceOptions = {}) {
    this.logger = options.logger;
    this.platform = options.platform ?? process.platform;
    this.windowsCommands =
      options.windowsCommands ??
      new WindowsCommandService({
        logger: options.logger,
        platform: this.platform
      });
    this.localAppDataDir =
      options.localAppDataDir ?? process.env.LOCALAPPDATA ?? path.join(process.cwd(), ".local");
    this.userProfileDir =
      options.userProfileDir ?? process.env.USERPROFILE ?? this.localAppDataDir;
    this.desktopDir = options.desktopDir ?? path.join(this.userProfileDir, "Desktop");
    this.browsers = options.browsers ?? DEFAULT_BROWSERS;
  }

  async configureBrowsers(config: {
    torSocksPort: number;
    localHttpProxyPort: number;
  }): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    const protectedRoot = path.join(
      this.localAppDataDir,
      "SecurityAiLab",
      "protected-browsers"
    );
    await mkdir(protectedRoot, { recursive: true });

    await Promise.all(
      this.browsers.map((browser) =>
        this.configureBrowser(browser, config, protectedRoot)
      )
    );
  }

  async restoreBrowsers(): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    let firstUnexpectedError: unknown = null;

    for (const [key, value] of this.originalRegistryValues.entries()) {
      const [registryPath, valueName] = key.split("|");
      if (!registryPath || !valueName) {
        continue;
      }

      try {
        if (value === null) {
          await this.windowsCommands.removeRegistryValue(registryPath, valueName);
        } else {
          await this.windowsCommands.setRegistryValue({
            path: registryPath,
            name: valueName,
            value,
            type: "String"
          });
        }
      } catch (error) {
        if (!this.isAccessDeniedError(error)) {
          firstUnexpectedError ??= error;
          continue;
        }

        this.logger?.warn(
          {
            error,
            registryPath,
            valueName
          },
          "Skipping browser proxy registry restoration because the current process does not have permission to update it"
        );
      }
    }

    for (const [filePath, originalContent] of this.originalFiles.entries()) {
      try {
        if (originalContent === null) {
          await rm(filePath, { force: true });
        } else {
          await mkdir(path.dirname(filePath), { recursive: true });
          await writeFile(filePath, originalContent, "utf8");
        }
      } catch (error) {
        if (!this.isAccessDeniedError(error)) {
          firstUnexpectedError ??= error;
          continue;
        }

        this.logger?.warn(
          {
            error,
            filePath
          },
          "Skipping browser proxy file restoration because the current process does not have permission to update it"
        );
      }
    }

    for (const shortcutPath of this.createdShortcuts) {
      try {
        await rm(shortcutPath, { force: true });
      } catch (error) {
        if (!this.isAccessDeniedError(error)) {
          firstUnexpectedError ??= error;
          continue;
        }

        this.logger?.warn(
          {
            error,
            shortcutPath
          },
          "Skipping protected browser shortcut cleanup because the current process does not have permission to update it"
        );
      }
    }

    this.originalRegistryValues.clear();
    this.originalFiles.clear();
    this.createdShortcuts.clear();
    this.configuredBrowsers.clear();

    if (firstUnexpectedError) {
      throw firstUnexpectedError;
    }
  }

  async verifyBrowserProxy(): Promise<BrowserProxyVerificationResult> {
    const details: string[] = [];
    const shortcutPaths = [...this.createdShortcuts];
    const configuredBrowsers = [...this.configuredBrowsers];

    if (configuredBrowsers.length === 0) {
      details.push("No protected browser profile or shortcut has been configured yet.");
    }

    for (const shortcutPath of shortcutPaths) {
      if (!(await this.pathExists(shortcutPath))) {
        details.push(`Missing protected shortcut: ${shortcutPath}`);
      }
    }

    if (details.length === 0) {
      details.push("Protected browser policies and shortcuts are present.");
    }

    return {
      passed: configuredBrowsers.length > 0 && details.length === 1,
      details,
      configuredBrowsers,
      shortcutPaths
    };
  }

  private async configureChromiumBrowser(
    browser: BrowserDescriptor,
    policyPath: string,
    localHttpProxyPort: number,
    profileDir: string
  ): Promise<void> {
    const executablePath = await this.resolveExecutable(browser.executableCandidates);
    if (!executablePath) {
      return;
    }

    await mkdir(profileDir, { recursive: true });

    await this.captureRegistryValue(policyPath, "ProxySettings");
    const proxySettings = JSON.stringify({
      ProxyMode: "fixed_servers",
      ProxyServer: `http://127.0.0.1:${localHttpProxyPort}`,
      ProxyBypassList: "localhost,127.0.0.1,<local>"
    });
    await this.windowsCommands.setRegistryValue({
      path: policyPath,
      name: "ProxySettings",
      value: proxySettings,
      type: "String"
    });

    const shortcutPath = path.join(this.desktopDir, browser.shortcutName);
    await this.createShortcut({
      shortcutPath,
      executablePath,
      arguments: [
        `--proxy-server=http://127.0.0.1:${localHttpProxyPort}`,
        "--proxy-bypass-list=<-loopback>",
        "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1 , EXCLUDE ::1",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--enforce-webrtc-ip-permission-check",
        `--user-data-dir=${this.quoteShortcutValue(profileDir)}`
      ]
    });
    this.createdShortcuts.add(shortcutPath);
    this.configuredBrowsers.add(browser.id);
  }

  private async configureFirefox(
    browser: BrowserDescriptor,
    torSocksPort: number,
    profileDir: string
  ): Promise<void> {
    const executablePath = await this.resolveExecutable(browser.executableCandidates);
    if (!executablePath) {
      return;
    }

    await mkdir(profileDir, { recursive: true });

    const userJsPath = path.join(profileDir, "user.js");
    await this.captureFile(userJsPath);
    const existingUserJs = this.originalFiles.get(userJsPath) ?? null;
    await writeFile(
      userJsPath,
      mergeFirefoxUserPreferences(existingUserJs, {
        "network.proxy.type": 1,
        "network.proxy.socks": "127.0.0.1",
        "network.proxy.socks_port": torSocksPort,
        "network.proxy.socks_version": 5,
        "network.proxy.socks_remote_dns": true,
        "media.peerconnection.enabled": false
      }),
      "utf8"
    );

    const shortcutPath = path.join(this.desktopDir, browser.shortcutName);
    await this.createShortcut({
      shortcutPath,
      executablePath,
      arguments: [
        "-no-remote",
        `-profile ${this.quoteShortcutValue(profileDir)}`
      ]
    });
    this.createdShortcuts.add(shortcutPath);
    this.configuredBrowsers.add(browser.id);
  }

  private async configureBrowser(
    browser: BrowserDescriptor,
    config: {
      torSocksPort: number;
      localHttpProxyPort: number;
    },
    protectedRoot: string
  ): Promise<void> {
    try {
      if (browser.id === "firefox") {
        await this.configureFirefox(
          browser,
          config.torSocksPort,
          path.join(protectedRoot, "firefox-profile")
        );
        return;
      }

      await this.configureChromiumBrowser(
        browser,
        browser.id === "chrome" ? CHROME_POLICY_PATH : EDGE_POLICY_PATH,
        config.localHttpProxyPort,
        path.join(protectedRoot, `${browser.id}-profile`)
      );
    } catch (error) {
      if (!this.isAccessDeniedError(error)) {
        throw error;
      }

      this.logger?.warn(
        {
          browserId: browser.id,
          error
        },
        "Skipping protected browser proxy configuration because the current process does not have permission to update browser settings"
      );
    }
  }

  private async captureRegistryValue(pathValue: string, name: string): Promise<void> {
    const key = `${pathValue}|${name}`;
    if (this.originalRegistryValues.has(key)) {
      return;
    }

    const currentValue = await this.windowsCommands.readRegistryValue(pathValue, name);
    this.originalRegistryValues.set(key, currentValue);
  }

  private async captureFile(filePath: string): Promise<void> {
    if (this.originalFiles.has(filePath)) {
      return;
    }

    this.originalFiles.set(
      filePath,
      (await this.pathExists(filePath)) ? await readFile(filePath, "utf8") : null
    );
  }

  private async createShortcut(options: {
    shortcutPath: string;
    executablePath: string;
    arguments: string[];
  }): Promise<void> {
    await mkdir(path.dirname(options.shortcutPath), { recursive: true });
    const script = [
      `$shortcutPath = ${this.windowsCommands.toPowerShellLiteral(options.shortcutPath)}`,
      `$targetPath = ${this.windowsCommands.toPowerShellLiteral(options.executablePath)}`,
      `$arguments = ${this.windowsCommands.toPowerShellLiteral(options.arguments.join(" "))}`,
      "$shell = New-Object -ComObject WScript.Shell",
      "$shortcut = $shell.CreateShortcut($shortcutPath)",
      "$shortcut.TargetPath = $targetPath",
      "$shortcut.Arguments = $arguments",
      "$shortcut.WorkingDirectory = Split-Path -Parent $targetPath",
      "$shortcut.IconLocation = $targetPath",
      "$shortcut.Save()"
    ].join("; ");

    await this.windowsCommands.runPowerShell(script);
  }

  private async resolveExecutable(candidates: string[]): Promise<string | null> {
    for (const candidate of candidates) {
      if (await this.pathExists(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private quoteShortcutValue(value: string): string {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  private isAccessDeniedError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    const code = "code" in error && typeof error.code === "string" ? error.code : "";
    const stdout =
      "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
    const stderr =
      "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
    const message =
      "message" in error && typeof error.message === "string" ? error.message : "";
    const output = `${code}\n${stdout}\n${stderr}\n${message}`;

    return /access is denied|permission denied|unauthorizedaccessexception|eacces|eperm/i.test(
      output
    );
  }
}
