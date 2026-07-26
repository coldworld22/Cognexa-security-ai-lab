import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import express from "express";

import {
  buildHttpsRedirectUrl,
  createHttpsEnforcementMiddleware
} from "../src/api/middlewares/https-enforcement.middleware";

test("buildHttpsRedirectUrl rewrites the request host to the configured HTTPS port", () => {
  const location = buildHttpsRedirectUrl(
    {
      headers: {
        host: "localhost:5000"
      },
      originalUrl: "/api/v1/chat?workspace=main"
    } as never,
    5443
  );

  assert.equal(location, "https://localhost:5443/api/v1/chat?workspace=main");
});

async function startServer(input: {
  forceHttps: boolean;
  httpsPort?: number | null;
  trustProxy?: boolean;
}) {
  const app = express();
  app.set("trust proxy", input.trustProxy ?? false);
  app.use(
    createHttpsEnforcementMiddleware({
      forceHttps: input.forceHttps,
      httpsPort: input.httpsPort ?? null
    })
  );
  app.get("/health", (_request, response) => {
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

test("https enforcement middleware redirects insecure requests", async (t) => {
  const server = await startServer({
    forceHttps: true,
    httpsPort: 5443
  });
  t.after(async () => {
    await server.close();
  });

  const response = await fetch(`${server.baseUrl}/health?check=1`, {
    headers: {
      Host: "localhost:5000"
    },
    redirect: "manual"
  });

  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    "https://127.0.0.1:5443/health?check=1"
  );
});

test("https enforcement middleware allows trusted proxied HTTPS requests", async (t) => {
  const server = await startServer({
    forceHttps: true,
    httpsPort: 5443,
    trustProxy: true
  });
  t.after(async () => {
    await server.close();
  });

  const response = await fetch(`${server.baseUrl}/health`, {
    headers: {
      Host: "localhost:5000",
      "X-Forwarded-Proto": "https"
    }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true
  });
});

test("https enforcement middleware stays inactive when forceHttps is disabled", async (t) => {
  const server = await startServer({
    forceHttps: false
  });
  t.after(async () => {
    await server.close();
  });

  const response = await fetch(`${server.baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true
  });
});
