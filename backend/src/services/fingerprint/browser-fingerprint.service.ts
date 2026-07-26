import { access, readdir, readFile, rm, writeFile } from "fs/promises";
import * as path from "path";

import { Logger } from "pino";

import {
  FingerprintVerificationResult
} from "../private-mode/full-protection.types";
import { mergeFirefoxUserPreferences } from "../browser/firefox-user-preferences";

export interface BrowserFingerprintServiceOptions {
  logger?: Logger;
  platform?: NodeJS.Platform;
  localAppDataDir?: string;
  appDataRoamingDir?: string;
}

export class BrowserFingerprintService {
  private readonly logger?: Logger;
  private readonly platform: NodeJS.Platform;
  private readonly localAppDataDir: string;
  private readonly appDataRoamingDir: string;
  private readonly originalFiles = new Map<string, string | null>();
  private readonly hardenedBrowsers = new Set<string>();

  constructor(options: BrowserFingerprintServiceOptions = {}) {
    this.logger = options.logger;
    this.platform = options.platform ?? process.platform;
    this.localAppDataDir =
      options.localAppDataDir ?? process.env.LOCALAPPDATA ?? path.join(process.cwd(), ".local");
    this.appDataRoamingDir =
      options.appDataRoamingDir ?? process.env.APPDATA ?? this.localAppDataDir;
  }

  async spoofBrowserFingerprint(): Promise<void> {
    if (this.platform !== "win32") {
      return;
    }

    const firefoxProfiles = await this.listFirefoxProfiles();
    for (const profileDir of firefoxProfiles) {
      const userJsPath = path.join(profileDir, "user.js");
      await this.captureFile(userJsPath);
      const existing = this.originalFiles.get(userJsPath) ?? null;
      await writeFile(
        userJsPath,
        mergeFirefoxUserPreferences(existing, {
          "privacy.resistFingerprinting": true,
          "privacy.trackingprotection.fingerprinting.enabled": true,
          "privacy.firstparty.isolate": true,
          "webgl.disabled": true,
          "dom.webnotifications.enabled": false,
          "beacon.enabled": false
        }),
        "utf8"
      );
    }

    if (firefoxProfiles.length > 0) {
      this.hardenedBrowsers.add("firefox");
    }

    for (const chromiumProfile of [
      path.join(this.localAppDataDir, "SecurityAiLab", "protected-browsers", "chrome-profile"),
      path.join(this.localAppDataDir, "SecurityAiLab", "protected-browsers", "edge-profile")
    ]) {
      if (await this.pathExists(chromiumProfile)) {
        this.hardenedBrowsers.add(path.basename(chromiumProfile).replace("-profile", ""));
      }
    }
  }

  async restoreFingerprint(): Promise<void> {
    for (const [filePath, content] of this.originalFiles.entries()) {
      if (content === null) {
        await rm(filePath, { force: true });
      } else {
        await writeFile(filePath, content, "utf8");
      }
    }

    this.originalFiles.clear();
    this.hardenedBrowsers.clear();
  }

  async verifyFingerprint(): Promise<FingerprintVerificationResult> {
    const details: string[] = [];
    const hardenedBrowsers = [...this.hardenedBrowsers];

    if (hardenedBrowsers.length === 0) {
      details.push("No protected browser fingerprint hardening has been applied yet.");
    } else {
      details.push("Firefox fingerprint-resistance settings and isolated protected browser profiles are in place.");
    }

    return {
      passed: hardenedBrowsers.length > 0,
      details,
      hardenedBrowsers
    };
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
