import assert from "node:assert/strict";
import { createServer, Server, Socket } from "node:net";
import * as net from "node:net";
import test from "node:test";
import * as http from "node:http";

import {
  BrowserProxySettings,
  ProxyManagerService
} from "../src/services/proxy/proxy-manager.service";

interface FakeSocksProxy {
  close: () => Promise<void>;
  port: number;
  requests: Array<{
    host: string;
    port: number;
  }>;
  traffic: string[];
}

async function createFakeSocksProxy(options: {
  onTraffic?: (socket: Socket, data: string) => void;
} = {}): Promise<FakeSocksProxy> {
  const requests: Array<{
    host: string;
    port: number;
  }> = [];
  const traffic: string[] = [];

  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let stage: "greeting" | "connect" | "traffic" = "greeting";

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (true) {
        if (stage === "greeting") {
          if (buffer.length < 3) {
            return;
          }

          assert.equal(buffer[0], 0x05);
          socket.write(Buffer.from([0x05, 0x00]));
          buffer = buffer.subarray(3);
          stage = "connect";
          continue;
        }

        if (stage === "connect") {
          const parsed = parseSocksConnectRequest(buffer);
          if (!parsed) {
            return;
          }

          requests.push({
            host: parsed.host,
            port: parsed.port
          });
          socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          buffer = buffer.subarray(parsed.bytesConsumed);
          stage = "traffic";
          continue;
        }

        const payload = buffer.toString("utf8");
        traffic.push(payload);
        options.onTraffic?.(socket, payload);
        buffer = Buffer.alloc(0);
        return;
      }
    });
  });

  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected the fake SOCKS proxy to listen on an ephemeral TCP port.");
  }

  return {
    close: () => closeServer(server),
    port: address.port,
    requests,
    traffic
  };
}

function parseSocksConnectRequest(buffer: Buffer): {
  bytesConsumed: number;
  host: string;
  port: number;
} | null {
  if (buffer.length < 5) {
    return null;
  }

  const atyp = buffer[3];
  if (atyp === 0x03) {
    const hostnameLength = buffer[4];
    if (hostnameLength === undefined || buffer.length < 5 + hostnameLength + 2) {
      return null;
    }

    return {
      bytesConsumed: 5 + hostnameLength + 2,
      host: buffer.subarray(5, 5 + hostnameLength).toString("utf8"),
      port: buffer.readUInt16BE(5 + hostnameLength)
    };
  }

  if (atyp === 0x01) {
    if (buffer.length < 10) {
      return null;
    }

    return {
      bytesConsumed: 10,
      host: Array.from(buffer.subarray(4, 8)).join("."),
      port: buffer.readUInt16BE(8)
    };
  }

  throw new Error(`Unsupported SOCKS address type in test proxy: ${String(atyp)}`);
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createManager(
  port: number,
  overrides: Record<string, unknown> = {}
): ProxyManagerService {
  return new ProxyManagerService({
    platform: "linux",
    getTorSession: async (workspaceId) => ({
      workspaceId,
      torSocksPort: port
    }),
    ...overrides
  });
}

test("ProxyManagerService blocks direct public raw TCP sockets while exposing browser proxy settings", async () => {
  const proxy = await createFakeSocksProxy();
  const manager = createManager(proxy.port);

  try {
    await manager.enableSystemProxy("workspace-1");

    const browserSettings = manager.getBrowserProxySettings(
      "workspace-1"
    ) as BrowserProxySettings | null;
    assert.ok(browserSettings);
    assert.match(browserSettings.server, /socks5:\/\/127\.0\.0\.1:/);

    await assert.rejects(
      async () =>
        await new Promise<void>((resolve, reject) => {
          const socket = net.connect(443, "example.com");
          socket.once("connect", () => resolve());
          socket.once("error", reject);
        }),
      /direct public tcp sockets are blocked/i
    );

    assert.equal(proxy.requests.length, 0);
  } finally {
    manager.dispose();
    await proxy.close();
  }
});

test("ProxyManagerService forces http.request traffic through the Tor SOCKS proxy", async () => {
  let responded = false;
  const proxy = await createFakeSocksProxy({
    onTraffic: (socket, data) => {
      if (responded || !data.includes("\r\n\r\n")) {
        return;
      }

      responded = true;
      socket.write(
        "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nhello"
      );
    }
  });
  const manager = createManager(proxy.port);

  try {
    await manager.enableSystemProxy("workspace-1");

    const response = await new Promise<{
      body: string;
      statusCode: number | undefined;
    }>((resolve, reject) => {
      http
        .get("http://example.com/health", (result) => {
          let body = "";
          result.setEncoding("utf8");
          result.on("data", (chunk) => {
            body += chunk;
          });
          result.on("end", () => {
            resolve({
              body,
              statusCode: result.statusCode
            });
          });
        })
        .once("error", reject);
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "hello");
    assert.equal(proxy.requests[0]?.host, "example.com");
    assert.equal(proxy.requests[0]?.port, 80);
    assert.ok(proxy.traffic.some((payload) => payload.includes("GET /health HTTP/1.1")));
  } finally {
    manager.dispose();
    await proxy.close();
  }
});

test("ProxyManagerService routes global fetch traffic through the Tor SOCKS proxy", async () => {
  let responded = false;
  const proxy = await createFakeSocksProxy({
    onTraffic: (socket, data) => {
      if (responded || !data.includes("\r\n\r\n")) {
        return;
      }

      responded = true;
      socket.write(
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 17\r\n\r\n{\"ok\":true,\"v\":1}"
      );
    }
  });
  const manager = createManager(proxy.port);

  try {
    await manager.enableSystemProxy("workspace-1");

    const response = await fetch("http://example.com/fetch-check");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      v: 1
    });
    assert.equal(proxy.requests[0]?.host, "example.com");
    assert.equal(proxy.requests[0]?.port, 80);
    assert.ok(
      proxy.traffic.some((payload) => payload.includes("GET /fetch-check HTTP/1.1"))
    );
  } finally {
    manager.dispose();
    await proxy.close();
  }
});

test("ProxyManagerService treats Tor status fallback as a valid observed exit", async () => {
  const manager = createManager(9050);

  (
    manager as unknown as {
      requireFetch: () => typeof fetch;
      runWithoutProxy: <T>(work: () => Promise<T>) => Promise<T>;
      fetchConnectionIdentity: () => Promise<{
        ip: string | null;
        city: string | null;
        region: string | null;
        country: string | null;
        countryCode: string | null;
        timezone: string | null;
        organization: string | null;
        asn: string | null;
        network: string | null;
        isTorExit: boolean | null;
      } | null>;
      fetchTorStatus: () => Promise<{
        ip: string | null;
        isTor: boolean | null;
      }>;
    }
  ).requireFetch = () => fetch;

  (
    manager as unknown as {
      runWithoutProxy: <T>(work: () => Promise<T>) => Promise<T>;
    }
  ).runWithoutProxy = async <T>(work: () => Promise<T>) => work();

  let identityCalls = 0;
  (
    manager as unknown as {
      fetchConnectionIdentity: () => Promise<{
        ip: string | null;
        city: string | null;
        region: string | null;
        country: string | null;
        countryCode: string | null;
        timezone: string | null;
        organization: string | null;
        asn: string | null;
        network: string | null;
        isTorExit: boolean | null;
      } | null>;
      fetchTorStatus: () => Promise<{
        ip: string | null;
        isTor: boolean | null;
      }>;
    }
  ).fetchConnectionIdentity = async () => {
    identityCalls += 1;

    if (identityCalls === 1) {
      return {
        ip: "203.0.113.10",
        city: null,
        region: null,
        country: null,
        countryCode: null,
        timezone: null,
        organization: null,
        asn: null,
        network: "ipv4",
        isTorExit: false
      };
    }

    return null;
  };

  (
    manager as unknown as {
      fetchTorStatus: () => Promise<{
        ip: string | null;
        isTor: boolean | null;
      }>;
    }
  ).fetchTorStatus = async () => ({
    ip: "198.51.100.88",
    isTor: true
  });

  await manager.enableSystemProxy("workspace-1");

  try {
    const result = await manager.verifyNoLeaks("workspace-1");

    assert.equal(result.exitIp, "198.51.100.88");
    assert.equal(result.exitIdentity?.ip, "198.51.100.88");
    assert.equal(result.exitIdentity?.isTorExit, true);
    assert.equal(result.transportVerified, true);
    assert.deepEqual(result.leaks, []);
  } finally {
    manager.dispose();
  }
});

test("ProxyManagerService applies and restores the Windows browser proxy state", async () => {
  const writes: Array<{
    enabled: boolean;
    server: string | null;
    override: string | null;
    autoConfigUrl: string | null;
    autoDetect: boolean;
  }> = [];
  const originalState = {
    enabled: false,
    server: null,
    override: "localhost",
    autoConfigUrl: "http://pac.local/proxy.pac",
    autoDetect: true
  };
  const manager = createManager(9050, {
    platform: "win32",
    manageOperatingSystemBrowserProxy: true,
    readSystemBrowserProxyState: async () => originalState,
    writeSystemBrowserProxyState: async (state: unknown) => {
      writes.push(state as (typeof writes)[number]);
    }
  });

  await manager.enableSystemProxy("workspace-1");
  await manager.disableSystemProxy("workspace-1");

  assert.deepEqual(writes, [
    {
      enabled: true,
      server: "socks=127.0.0.1:9050",
      override: "localhost;127.*;<local>",
      autoConfigUrl: null,
      autoDetect: false
    },
    originalState
  ]);
});
