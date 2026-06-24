const DEFAULT_VERIFICATION_BYPASS_ALLOWED_DOMAINS = [
  "localhost",
  "127.0.0.1",
  "::1",
  "*.localhost",
  "*.local",
  "*.test.local"
];

export interface DevModeConfig {
  environment: "development" | "test" | "production";
  enabled: boolean;
  bypassVerification: boolean;
  allowedDomains: string[];
}

function normalizeEnvironment(value: string | undefined): DevModeConfig["environment"] {
  switch (value) {
    case "production":
      return "production";
    case "test":
      return "test";
    default:
      return "development";
  }
}

function parseAllowedDomains(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [...DEFAULT_VERIFICATION_BYPASS_ALLOWED_DOMAINS];
  }

  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function getDevModeConfig(): DevModeConfig {
  const environment = normalizeEnvironment(process.env.NODE_ENV);
  const bypassEnabled = process.env.ENABLE_VERIFICATION_BYPASS === "true";

  return {
    environment,
    enabled: environment === "development" && bypassEnabled,
    bypassVerification: environment === "development" && bypassEnabled,
    allowedDomains: parseAllowedDomains(
      process.env.VERIFICATION_BYPASS_ALLOWED_DOMAINS
    )
  };
}

export function isVerificationBypassAllowed(): boolean {
  const config = getDevModeConfig();
  return config.enabled && config.bypassVerification;
}
