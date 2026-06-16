import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().default("/api/v1"),
  POSTGRES_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(12),
  JWT_REFRESH_SECRET: z.string().min(12),
  ADMIN_LOGIN: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_DISPLAY_NAME: z.string().min(1).default("Administrator"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),
  AUTHZ_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  DEFAULT_LLM_PROVIDER: z
    .enum(["qwen", "llama", "mistral", "gemma"])
    .default("qwen"),
  DEFAULT_LLM_MODEL: z.string().default("qwen2.5-coder"),
  LOCAL_MODEL_BASE_URL: z.string().url().default("http://localhost:11434/v1"),
  LOCAL_EMBEDDING_BASE_URL: z
    .string()
    .url()
    .default("http://localhost:11434/v1"),
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

export const env = envSchema.parse(process.env);
