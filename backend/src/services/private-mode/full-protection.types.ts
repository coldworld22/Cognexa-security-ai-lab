export interface FullProtectionConfig {
  workspaceId: string;
  torSocksPort: number;
  torDnsPort?: number;
  enableKillSwitch?: boolean;
  dnsOverTor?: boolean;
}

export interface VerificationCheckResult {
  passed: boolean;
  details: string[];
}

export interface SystemProxyVerificationResult extends VerificationCheckResult {
  bridgeListening: boolean;
  localHttpProxyPort: number | null;
  winInetConfigured: boolean;
  winHttpConfigured: boolean;
}

export interface BrowserProxyVerificationResult extends VerificationCheckResult {
  configuredBrowsers: string[];
  shortcutPaths: string[];
}

export interface AppProxyVerificationResult extends VerificationCheckResult {
  enforcedPrograms: string[];
}

export interface WebRtcVerificationResult extends VerificationCheckResult {
  configuredBrowsers: string[];
}

export interface DNSVerificationResult extends VerificationCheckResult {
  torDnsPortReachable: boolean;
  protectedAdapters: string[];
}

export interface IpLeakVerificationResult extends VerificationCheckResult {
  activeRuleNames: string[];
}

export interface FingerprintVerificationResult extends VerificationCheckResult {
  hardenedBrowsers: string[];
}

export interface FullProtectionVerificationResult {
  passed: boolean;
  verifiedAt: string;
  leaks: string[];
  advisories: string[];
  results: {
    systemProxy: SystemProxyVerificationResult;
    browserProxy: BrowserProxyVerificationResult;
    appProxy: AppProxyVerificationResult;
    webrtc: WebRtcVerificationResult;
    dns: DNSVerificationResult;
    ipLeak: IpLeakVerificationResult;
    fingerprint: FingerprintVerificationResult;
  };
}
