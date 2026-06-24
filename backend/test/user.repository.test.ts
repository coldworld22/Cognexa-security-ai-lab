import test from "node:test";
import assert from "node:assert/strict";

import { UserRepository } from "../src/database/repositories/user.repository";

function createRow(email: string) {
  const timestamp = new Date("2026-06-18T00:00:00.000Z");

  return {
    id: "user-1",
    email,
    display_name: "Maya Analyst",
    password_hash: "hash",
    role: "developer",
    preferences: {},
    current_workspace_id: "workspace-1",
    last_login_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp
  };
}

test("UserRepository finds a user by a unique email local-part alias", async () => {
  let queryCount = 0;

  const repository = new UserRepository({
    query: async (sql: string) => {
      queryCount += 1;

      if (queryCount === 1) {
        assert.match(sql, /LOWER\(email\) = LOWER\(\$1\)/);
        return {
          rowCount: 0,
          rows: []
        };
      }

      assert.match(sql, /SPLIT_PART\(email, '@', 1\)/);
      return {
        rowCount: 1,
        rows: [createRow("maya.analyst@seed.local")]
      };
    }
  } as never);

  const user = await repository.findByLoginIdentifier("maya.analyst");

  assert.equal(queryCount, 2);
  assert.equal(user?.email, "maya.analyst@seed.local");
});

test("UserRepository prefers exact email matches before username alias lookup", async () => {
  let queryCount = 0;

  const repository = new UserRepository({
    query: async (sql: string, params: unknown[]) => {
      queryCount += 1;
      assert.match(sql, /LOWER\(email\) = LOWER\(\$1\)/);
      assert.equal(params[0], "MAYA.ANALYST@SEED.LOCAL");

      return {
        rowCount: 1,
        rows: [createRow("maya.analyst@seed.local")]
      };
    }
  } as never);

  const user = await repository.findByLoginIdentifier("MAYA.ANALYST@SEED.LOCAL");

  assert.equal(queryCount, 1);
  assert.equal(user?.email, "maya.analyst@seed.local");
});

test("UserRepository rejects ambiguous username aliases", async () => {
  let queryCount = 0;

  const repository = new UserRepository({
    query: async () => {
      queryCount += 1;

      if (queryCount === 1) {
        return {
          rowCount: 0,
          rows: []
        };
      }

      return {
        rowCount: 2,
        rows: [
          createRow("maya.analyst@seed.local"),
          createRow("maya.analyst@example.com")
        ]
      };
    }
  } as never);

  const user = await repository.findByLoginIdentifier("maya.analyst");

  assert.equal(queryCount, 2);
  assert.equal(user, null);
});
