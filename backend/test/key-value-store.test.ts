import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  FileKeyValueStore,
  MemoryKeyValueStore
} from "../src/database/key-value-store";

test("MemoryKeyValueStore supports get, set, delete, and expiration", async () => {
  const store = new MemoryKeyValueStore();

  await store.set("session", "abc123", {
    EX: 1
  });
  assert.equal(await store.get("session"), "abc123");

  await new Promise((resolve) => setTimeout(resolve, 1_100));
  assert.equal(await store.get("session"), null);

  await store.set("one", "1");
  await store.set("two", "2");
  assert.equal(await store.del(["one", "two"]), 2);
  assert.equal(await store.get("one"), null);
  assert.equal(await store.get("two"), null);
});

test("FileKeyValueStore persists values across restarts and honors expiration", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "security-ai-lab-kv-"));
  const filePath = join(tempDir, "runtime-store.json");

  try {
    let store = new FileKeyValueStore(filePath);

    await store.set("session", "abc123");
    await store.set("temp", "expires-soon", {
      EX: 1
    });

    assert.equal(await store.get("session"), "abc123");
    assert.equal(await store.get("temp"), "expires-soon");

    await store.quit();

    store = new FileKeyValueStore(filePath);
    assert.equal(await store.get("session"), "abc123");
    assert.equal(await store.get("temp"), "expires-soon");

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    assert.equal(await store.get("temp"), null);
    assert.equal(await store.del("session"), 1);
    assert.equal(await store.get("session"), null);

    await store.quit();

    store = new FileKeyValueStore(filePath);
    assert.equal(await store.get("session"), null);
    assert.equal(await store.get("temp"), null);
    await store.quit();
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true
    });
  }
});
