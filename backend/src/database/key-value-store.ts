import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";
import { EventEmitter } from "events";

export interface KeyValueStoreSetOptions {
  EX?: number;
}

export interface KeyValueStore {
  readonly isOpen: boolean;
  connect(): Promise<void>;
  quit(): Promise<void>;
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: KeyValueStoreSetOptions
  ): Promise<string>;
  del(keys: string | string[]): Promise<number>;
  on(event: "error", listener: (error: Error) => void): this;
}

interface MemoryValue {
  value: string;
  expiresAt?: number;
}

type PersistedKeyValueStore = Record<string, MemoryValue>;

export class MemoryKeyValueStore
  extends EventEmitter
  implements KeyValueStore
{
  private readonly store = new Map<string, MemoryValue>();
  private open = false;

  get isOpen(): boolean {
    return this.open;
  }

  async connect(): Promise<void> {
    this.open = true;
  }

  async quit(): Promise<void> {
    this.open = false;
  }

  async ping(): Promise<string> {
    if (!this.open) {
      await this.connect();
    }

    return "PONG";
  }

  async get(key: string): Promise<string | null> {
    if (!this.open) {
      await this.connect();
    }

    this.deleteExpiredKey(key);
    return this.store.get(key)?.value ?? null;
  }

  async set(
    key: string,
    value: string,
    options?: KeyValueStoreSetOptions
  ): Promise<string> {
    if (!this.open) {
      await this.connect();
    }

    const expiresAt =
      typeof options?.EX === "number" ? Date.now() + options.EX * 1000 : undefined;

    this.store.set(key, {
      value,
      expiresAt
    });

    return "OK";
  }

  async del(keys: string | string[]): Promise<number> {
    if (!this.open) {
      await this.connect();
    }

    const values = Array.isArray(keys) ? keys : [keys];
    let deleted = 0;

    for (const key of values) {
      this.deleteExpiredKey(key);
      if (this.store.delete(key)) {
        deleted += 1;
      }
    }

    return deleted;
  }

  private deleteExpiredKey(key: string): void {
    const value = this.store.get(key);
    if (!value?.expiresAt) {
      return;
    }

    if (value.expiresAt <= Date.now()) {
      this.store.delete(key);
    }
  }
}

export class FileKeyValueStore
  extends EventEmitter
  implements KeyValueStore
{
  private readonly store = new Map<string, MemoryValue>();
  private open = false;
  private connectPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {
    super();
  }

  get isOpen(): boolean {
    return this.open;
  }

  async connect(): Promise<void> {
    if (this.open) {
      return;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.initialize().finally(() => {
        this.connectPromise = null;
      });
    }

    await this.connectPromise;
  }

  async quit(): Promise<void> {
    if (!this.open) {
      return;
    }

    await this.flushToDisk();
    this.open = false;
  }

  async ping(): Promise<string> {
    await this.ensureOpen();
    return "PONG";
  }

  async get(key: string): Promise<string | null> {
    await this.ensureOpen();

    if (this.deleteExpiredKeys([key])) {
      await this.flushToDisk();
    }

    return this.store.get(key)?.value ?? null;
  }

  async set(
    key: string,
    value: string,
    options?: KeyValueStoreSetOptions
  ): Promise<string> {
    await this.ensureOpen();
    this.deleteExpiredKeys();

    const expiresAt =
      typeof options?.EX === "number" ? Date.now() + options.EX * 1000 : undefined;

    this.store.set(key, {
      value,
      expiresAt
    });

    await this.flushToDisk();
    return "OK";
  }

  async del(keys: string | string[]): Promise<number> {
    await this.ensureOpen();
    this.deleteExpiredKeys();

    const values = Array.isArray(keys) ? keys : [keys];
    let deleted = 0;

    for (const key of values) {
      if (this.store.delete(key)) {
        deleted += 1;
      }
    }

    if (deleted > 0) {
      await this.flushToDisk();
    }

    return deleted;
  }

  private async initialize(): Promise<void> {
    await mkdir(dirname(this.filePath), {
      recursive: true
    });

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedKeyValueStore;
      this.hydrateFromDisk(parsed);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        this.emit("error", this.toStoreError("Failed to read the local key-value store", error));
      }
    }

    this.open = true;

    if (this.deleteExpiredKeys()) {
      await this.flushToDisk();
      return;
    }

    try {
      await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        await this.flushToDisk();
      }
    }
  }

  private hydrateFromDisk(value: PersistedKeyValueStore): void {
    this.store.clear();

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return;
    }

    for (const [key, entry] of Object.entries(value)) {
      if (!entry || typeof entry.value !== "string") {
        continue;
      }

      const expiresAt =
        typeof entry.expiresAt === "number" && Number.isFinite(entry.expiresAt)
          ? entry.expiresAt
          : undefined;

      this.store.set(key, {
        value: entry.value,
        expiresAt
      });
    }
  }

  private async ensureOpen(): Promise<void> {
    if (!this.open) {
      await this.connect();
    }
  }

  private deleteExpiredKeys(keys?: string[]): boolean {
    const targets = keys ?? Array.from(this.store.keys());
    let changed = false;

    for (const key of targets) {
      const value = this.store.get(key);
      if (!value?.expiresAt) {
        continue;
      }

      if (value.expiresAt <= Date.now()) {
        this.store.delete(key);
        changed = true;
      }
    }

    return changed;
  }

  private async flushToDisk(): Promise<void> {
    const payload = JSON.stringify(this.serialize(), null, 2);

    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), {
          recursive: true
        });
        await writeFile(this.filePath, payload, "utf8");
      })
      .catch((error) => {
        const storeError = this.toStoreError(
          "Failed to write the local key-value store",
          error
        );
        this.emit("error", storeError);
        throw storeError;
      });

    await this.writeQueue;
  }

  private serialize(): PersistedKeyValueStore {
    const value: PersistedKeyValueStore = {};

    for (const [key, entry] of this.store.entries()) {
      value[key] = entry.expiresAt
        ? {
            value: entry.value,
            expiresAt: entry.expiresAt
          }
        : {
            value: entry.value
          };
    }

    return value;
  }

  private toStoreError(message: string, error: unknown): Error {
    const cause = error instanceof Error ? `: ${error.message}` : "";
    return new Error(`${message}${cause}`);
  }
}
