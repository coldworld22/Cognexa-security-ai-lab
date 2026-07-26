import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import express from "express";

import {
  adminIpAllowlistInternals,
  createAdminIpAllowlistMiddleware
} from "../src/api/middlewares/admin-ip-allowlist.middleware";

function createResponseDouble() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };
}

async function startServer(allowedIps: string[]) {
  const app = express();
  app.use("/admin", createAdminIpAllowlistMiddleware(allowedIps));
  app.get("/admin/ping", (_request, response) => {
    response.json({
      ok: true
    });
  });

  const server = await new Promise<Server>((resolve) => {
    const nextServer = app.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      })
  };
}

test("admin IP allowlist middleware normalizes IPv4-mapped IPv6 literals", () => {
  assert.equal(
    adminIpAllowlistInternals.normalizeIpLiteral("::ffff:127.0.0.1"),
    "127.0.0.1"
  );
  assert.equal(
    adminIpAllowlistInternals.normalizeIpLiteral("[::1]"),
    "::1"
  );
});

test("admin IP allowlist middleware allows a normalized loopback request", () => {
  const response = createResponseDouble();
  let nextCalled = false;
  const middleware = createAdminIpAllowlistMiddleware(["127.0.0.1"]);

  middleware(
    {
      ip: "::ffff:127.0.0.1",
      socket: {
        remoteAddress: "::ffff:127.0.0.1"
      }
    } as never,
    response as never,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, 200);
});

test("admin IP allowlist middleware denies requests outside the allowlist", () => {
  const response = createResponseDouble();
  let nextCalled = false;
  const middleware = createAdminIpAllowlistMiddleware(["10.0.0.5"]);

  middleware(
    {
      ip: "127.0.0.1",
      socket: {
        remoteAddress: "127.0.0.1"
      }
    } as never,
    response as never,
    () => {
      nextCalled = true;
    }
  );

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    error: "Access denied"
  });
});

test("admin IP allowlist middleware permits admin routes when the client IP is allowlisted", async (t) => {
  const server = await startServer(["127.0.0.1"]);
  t.after(async () => {
    await server.close();
  });

  const response = await fetch(`${server.baseUrl}/admin/ping`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true
  });
});

test("admin IP allowlist middleware blocks admin routes when the client IP is not allowlisted", async (t) => {
  const server = await startServer(["10.0.0.1"]);
  t.after(async () => {
    await server.close();
  });

  const response = await fetch(`${server.baseUrl}/admin/ping`);

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Access denied"
  });
});
