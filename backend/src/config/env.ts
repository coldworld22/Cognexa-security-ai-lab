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
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("7d"),
  DEFAULT_LLM_PROVIDER: z
    .enum(["qwen", "llama", "mistral", "gemma"])
    .default("qwen"),
  DEFAULT_LLM_MODEL: z.string().default("qwen2.5-coder"),
  LOCAL_MODEL_BASE_URL: z.string().url().default("http://localhost:11434/v1"),
  QDRANT_URL: z.string().url().default("http://localhost:6333"),
  EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(8),
  STORAGE_PATH: z.string().default("../storage"),
  UPLOADS_PATH: z.string().default("../uploads")
});

export const env = envSchema.parse(process.env);
