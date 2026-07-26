import { access, mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import * as path from "path";

import { Logger } from "pino";

import {
  WebRtcVerificationResult
} from "../private-mode/full-protection.types";
import { WindowsCommandService } from "../system-protection/windows-command.service";
import { mergeFirefoxUserPreferences } from "../browser/firefox-user-preferences";

const CHROME_POLICY_PATH = "HKCU:\\Software\\Policies\\Google\\Chrome";
const EDGE_POLICY_PATH = "HKCU:\\Software\\Policies\\Microsoft\\Edge";

export interface WebRTCBlockServiceOptions {
  logger?: Logger;
  platform?: NodeJS.Platform;
  windowsCommands?: WindowsCommandService;
  localAppDataDir?: string;
  appDataRoamingDir?: string;
}

export class WebRTCBlockService {
  private readonly logger?: Logger;
  private readonly platform: NodeJS.Platform;
  private readonly windowsCommands: WindowsCommandService;
  private readonly localAppDataDir: string;
  private readonly appDataRoamingDir: string;
  private readonly originalRegistryValues = new Map<string, string | null>();
  private readonly originalFiles = new Map<string, string | null>();
  private readonly configuredBrowsers = new Set<string>();

  constructor(options: WebRTCBlockServiceOptions = {}) {
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
    this.appDataRoamingDir =
      options.appDataRoamingDir ?? process.env.APPDATA ?? this.localAppDataDir;
  }

  async blockWebRTC(): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    await Promise.all([
      this.applyChromiumPolicy(CHROME_POLICY_PATH),
      this.applyChromiumPolicy(EDGE_POLICY_PATH),
      this.applyFirefoxPolicies()
    ]);
  }

  async unblockWebRTC(): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    for (const [key, value] of this.originalRegistryValues.entries()) {
      const [registryPath, valueName] = key.split("|");
      if (!registryPath || !valueName) {
        continue;
      }

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
    }

    for (const [filePath, content] of this.originalFiles.entries()) {
      if (content === null) {
        await rm(filePath, { force: true });
      } else {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf8");
      }
    }

    this.originalRegistryValues.clear();
    this.originalFiles.clear();
    this.configuredBrowsers.clear();
  }

  async verifyWebRTCBlocked(): Promise<WebRtcVerificationResult> {
    const details: string[] = [];
    const configuredBrowsers = [...this.configuredBrowsers];

    if (configuredBrowsers.length === 0) {
      details.push("No WebRTC protections have been applied yet.");
    } else {
      details.push("Chromium policies and Firefox profile preferences disable non-proxied WebRTC.");
    }

    return {
      passed: configuredBrowsers.length > 0,
      details,
      configuredBrowsers
    };
  }

  private async applyChromiumPolicy(policyPath: string): Promise<void> {
    const browserId = policyPath === CHROME_POLICY_PATH ? "chrome" : "edge";
    await this.captureRegistryValue(policyPath, "WebRtcIPHandlingPolicy");
    await this.windowsCommands.setRegistryValue({
      path: policyPath,
      name: "WebRtcIPHandlingPolicy",
      value: "disable_non_proxied_udp",
      type: "String"
    });
    this.configuredBrowsers.add(browserId);
  }

  private async applyFirefoxPolicies(): Promise<void> {
    const profileDirs = await this.listFirefoxProfiles();
    if (profileDirs.length === 0) {
      return;
    }

    for (const profileDir of profileDirs) {
      const userJsPath = path.join(profileDir, "user.js");
      await this.captureFile(userJsPath);
      const existing = this.originalFiles.get(userJsPath) ?? null;
      await writeFile(
        userJsPath,
        mergeFirefoxUserPreferences(existing, {
          "media.peerconnection.enabled": false,
          "media.peerconnection.ice.default_address_only": true,
          "media.peerconnection.ice.no_host": true
        }),
        "utf8"
      );
    }

    this.configuredBrowsers.add("firefox");
  }

  private async listFirefoxProfiles(): Promise<string[]> {
    const profiles = new Set<string>();
    const protectedProfile = path.join(
      this.localAppDataDir,
      "SecurityAiLab",
      "protected-browsers",
      "firefox-profile"
    );
    if (await this.pathExists(protectedProfile)) {
      profiles.add(protectedProfile);
    }

    const roamingProfilesRoot = path.join(
      this.appDataRoamingDir,
      "Mozilla",
      "Firefox",
      "Profiles"
    );
    if (!(await this.pathExists(roamingProfilesRoot))) {
      return [...profiles];
    }

    const entries = await readdir(roamingProfilesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        profiles.add(path.join(roamingProfilesRoot, entry.name));
      }
    }

    return [...profiles];
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

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
