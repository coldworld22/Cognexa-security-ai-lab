import { resolve } from "path";

import { createClient } from "redis";

import {
  FileKeyValueStore,
  KeyValueStore,
  MemoryKeyValueStore
} from "./key-value-store";

interface CreateRedisClientOptions {
  storagePath?: string;
}

function resolveLocalStoreFilePath(storagePath = "../storage"): string {
  return resolve(process.cwd(), storagePath, "runtime", "local-kv.json");
}

function resolveFileStorePath(url: string): string {
  const rawPath = decodeURIComponent(url.slice("file://".length).trim());
  if (!rawPath) {
    throw new Error("file:// REDIS_URL values must include a target path.");
  }

  return resolve(process.cwd(), rawPath);
}

export function createRedisClient(
  url: string,
  options: CreateRedisClientOptions = {}
): KeyValueStore {
  if (url === "memory://local") {
    return new FileKeyValueStore(resolveLocalStoreFilePath(options.storagePath));
  }

  if (url.startsWith("memory://")) {
    return new MemoryKeyValueStore();
  }

  if (url.startsWith("file://")) {
    return new FileKeyValueStore(resolveFileStorePath(url));
  }

  return createClient({
    url
  }) as unknown as KeyValueStore;
}
