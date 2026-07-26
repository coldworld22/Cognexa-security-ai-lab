import { config } from "dotenv";
import { isIP } from "net";
import { z } from "zod";

config();

const fortiGateBaseUrl =
  process.env.FORTIGATE_BASE_URL ?? process.env.FORTIGATE_HOST;
const fortiGateApiToken =
  process.env.FORTIGATE_API_TOKEN ?? process.env.FORTIGATE_TOKEN;
const fortiGateVerifyTls =
  process.env.FORTIGATE_VERIFY_TLS ??
  (process.env.FORTIGATE_ALLOW_SELF_SIGNED ? undefined : "true");
const fortiGateAllowSelfSigned =
  process.env.FORTIGATE_ALLOW_SELF_SIGNED ??
  (fortiGateVerifyTls
    ? fortiGateVerifyTls === "false"
      ? "true"
      : "false"
    : undefined);

const optionalEnvValue = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  }, schema.optional());

const normalizeIpLiteral = (value: string): string => {
  const trimmed = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const withoutZone =
    trimmed.includes("%") ? trimmed.slice(0, trimmed.indexOf("%")) : trimmed;
  const mappedIpv4 = withoutZone.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);

  if (mappedIpv4?.[1] && isIP(mappedIpv4[1]) === 4) {
    return mappedIpv4[1];
  }

  return withoutZone;
};

const ipListEnvValue = z.preprocess((value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}, z.array(z.string().min(1)).superRefine((value, context) => {
  for (const entry of value) {
    if (isIP(normalizeIpLiteral(entry)) === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid IP address in ADMIN_IP_ALLOWLIST: ${entry}`
      });
    }
  }
}).transform((value) =>
  Array.from(new Set(value.map((entry) => normalizeIpLiteral(entry))))
));

const trustProxyEnvValue = z.preprocess((value) => {
  if (typeof value !== "string" || value.trim() === "") {
    return false;
  }

  const trimmed = value.trim().toLowerCase();
  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (/^\d+$/u.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  return value.trim();
}, z.union([z.boolean(), z.number().int().nonnegative(), z.string().min(1)]));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  HTTP_REDIRECT_PORT: optionalEnvValue(z.coerce.number().int().positive()),
  API_PREFIX: z.string().default("/api/v1"),
  HTTPS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  FORCE_HTTPS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  HTTPS_KEY_FILE: optionalEnvValue(z.string().min(1)),
  HTTPS_CERT_FILE: optionalEnvValue(z.string().min(1)),
  HTTPS_CA_FILE: optionalEnvValue(z.string().min(1)),
  TRUST_PROXY: trustProxyEnvValue.default(false),
  POSTGRES_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(12),
  JWT_REFRESH_SECRET: z.string().min(12),
  ENDPOINT_ENROLLMENT_TOKEN: optionalEnvValue(z.string().min(16)),
  FORTIGATE_BASE_URL: optionalEnvValue(z.string().url()),
  FORTIGATE_API_TOKEN: optionalEnvValue(z.string().min(16)),
  FORTIGATE_VDOM: optionalEnvValue(z.string().min(1)),
  FORTIGATE_ALLOW_SELF_SIGNED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  ADMIN_LOGIN: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_DISPLAY_NAME: z.string().min(1).default("Administrator"),
  ADMIN_IP_ALLOWLIST: ipListEnvValue.default([]),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),
  AUTHZ_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  DEFAULT_LLM_PROVIDER: z
    .enum(["qwen", "llama", "mistral", "gemma"])
    .default("qwen"),
  DEFAULT_LLM_MODEL: z.string().default("qwen2.5-coder"),
  AUTHORIZED_TESTING_DEV_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  LOCAL_MODEL_BASE_URL: z.string().url().default("http://localhost:11434/v1"),
  LOCAL_EMBEDDING_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:11434/v1"),
  WEBSITE_SCANNER_BROWSER_PATH: optionalEnvValue(z.string().min(1)),
  DEFAULT_EMBEDDING_MODEL: z.string().default("nomic-embed-text"),
  QDRANT_URL: z.string().url().default("http://localhost:6333"),
  EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(768),
  RAG_MAX_CHUNKS: z.coerce.number().int().positive().default(5),
  RAG_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.2),
  RAG_MAX_CONTEXT_TOKENS: z.coerce.number().int().positive().default(1200),
  STORAGE_PATH: z.string().default("../storage"),
  UPLOADS_PATH: z.string().default("../uploads"),
  STARTUP_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(20),
  STARTUP_RETRY_DELAY_MS: z.coerce.number().int().positive().default(3000)
});

export const env = envSchema.parse({
  ...process.env,
  FORTIGATE_BASE_URL: fortiGateBaseUrl,
  FORTIGATE_API_TOKEN: fortiGateApiToken,
  FORTIGATE_ALLOW_SELF_SIGNED: fortiGateAllowSelfSigned ?? process.env.FORTIGATE_ALLOW_SELF_SIGNED
});
