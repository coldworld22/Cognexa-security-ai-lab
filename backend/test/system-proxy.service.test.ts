import assert from "node:assert/strict";
import * as http from "node:http";
import { createServer, Server, Socket } from "node:net";
import test from "node:test";

import { SystemProxyService } from "../src/services/system-proxy/system-proxy.service";
import {
  TorHttpProxyBridgeService,
  TorHttpProxyBridgeState
} from "../src/services/system-proxy/tor-http-proxy-bridge.service";

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

test("TorHttpProxyBridgeService relays HTTP proxy requests through the Tor SOCKS tunnel", async () => {
  let responded = false;
  const socksProxy = await createFakeSocksProxy({
    onTraffic: (socket, data) => {
      if (responded || !data.includes("\r\n\r\n")) {
        return;
      }

      responded = true;
      socket.write(
        "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 7\r\n\r\nbridged"
      );
    }
  });
  const bridge = new TorHttpProxyBridgeService();

  try {
    const bridgeState = await bridge.start({
      torSocksPort: socksProxy.port
    });

    const response = await new Promise<{
      body: string;
      statusCode: number | undefined;
    }>((resolve, reject) => {
      http
        .get(
          {
            host: "127.0.0.1",
            port: bridgeState.listenPort,
            path: "http://example.com/health",
            headers: {
              Host: "example.com"
            }
          },
          (result) => {
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
          }
        )
        .once("error", reject);
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, "bridged");
    assert.equal(socksProxy.requests[0]?.host, "example.com");
    assert.equal(socksProxy.requests[0]?.port, 80);
    assert.ok(socksProxy.traffic.some((payload) => payload.includes("GET /health HTTP/1.1")));
  } finally {
    await bridge.stop();
    await socksProxy.close();
  }
});

test("SystemProxyService applies loopback WinINET and WinHTTP proxy settings and restores them", async () => {
  const winInetWrites: Array<{
    enabled: boolean;
    server: string | null;
    override: string | null;
    autoConfigUrl: string | null;
    autoDetect: boolean;
  }> = [];
  const winHttpWrites: Array<{
    enabled: boolean;
    server: string | null;
    bypassList: string | null;
  }> = [];
  const originalWinInetState = {
    enabled: false,
    server: null,
    override: null,
    autoConfigUrl: null,
    autoDetect: true
  };
  const originalWinHttpState = {
    enabled: false,
    server: null,
    bypassList: null
  };
  let currentBridgeState: TorHttpProxyBridgeState | null = null;
  const bridge = {
    start: async ({
      torSocksPort
    }: {
      torSocksPort: number;
    }): Promise<TorHttpProxyBridgeState> => {
      currentBridgeState = {
        torSocksPort,
        listenPort: 9080,
        startedAt: new Date("2026-07-06T00:00:00.000Z").toISOString()
      };
      return currentBridgeState;
    },
    stop: async () => {
      currentBridgeState = null;
    },
    getState: () => currentBridgeState
  } as unknown as TorHttpProxyBridgeService;
  const service = new SystemProxyService({
    platform: "win32",
    bridge,
    readWinInetState: async () =>
      winInetWrites.at(-1) ?? originalWinInetState,
    writeWinInetState: async (state) => {
      winInetWrites.push(state);
    },
    readWinHttpState: async () =>
      winHttpWrites.at(-1) ?? originalWinHttpState,
    writeWinHttpState: async (state) => {
      winHttpWrites.push(state);
    }
  });

  await service.enableSystemProxy(9050);

  const verification = await service.verifySystemProxy();
  assert.equal(verification.passed, true);
  assert.equal(verification.localHttpProxyPort, 9080);

  await service.disableSystemProxy();

  assert.deepEqual(winInetWrites, [
    {
      enabled: true,
      server: "http=127.0.0.1:9080;https=127.0.0.1:9080;socks=127.0.0.1:9050",
      override: "localhost;127.*;<local>",
      autoConfigUrl: null,
      autoDetect: false
    },
    originalWinInetState
  ]);
  assert.deepEqual(winHttpWrites, [
    {
      enabled: true,
      server: "http=127.0.0.1:9080;https=127.0.0.1:9080",
      bypassList: "localhost;127.*;<local>"
    },
    originalWinHttpState
  ]);
});

test("SystemProxyService tolerates WinHTTP access-denied errors and keeps WinINET active", async () => {
  const winInetWrites: Array<{
    enabled: boolean;
    server: string | null;
    override: string | null;
    autoConfigUrl: string | null;
    autoDetect: boolean;
  }> = [];
  let currentBridgeState: TorHttpProxyBridgeState | null = null;
  const bridge = {
    start: async ({
      torSocksPort
    }: {
      torSocksPort: number;
    }): Promise<TorHttpProxyBridgeState> => {
      currentBridgeState = {
        torSocksPort,
        listenPort: 9080,
        startedAt: new Date("2026-07-07T09:00:00.000Z").toISOString()
      };
      return currentBridgeState;
    },
    stop: async () => {
      currentBridgeState = null;
    },
    getState: () => currentBridgeState
  } as unknown as TorHttpProxyBridgeService;

  const service = new SystemProxyService({
    platform: "win32",
    bridge,
    readWinInetState: async () =>
      winInetWrites.at(-1) ?? {
        enabled: false,
        server: null,
        override: null,
        autoConfigUrl: null,
        autoDetect: true
      },
    writeWinInetState: async (state) => {
      winInetWrites.push(state);
    },
    readWinHttpState: async () => ({
      enabled: false,
      server: null,
      bypassList: null
    }),
    writeWinHttpState: async () => {
      const error = new Error("Access is denied.") as Error & {
        stdout?: string;
      };
      error.stdout = "Error writing proxy settings. (5) Access is denied.";
      throw error;
    }
  });

  await service.enableSystemProxy(9150);

  const verification = await service.verifySystemProxy();
  assert.equal(winInetWrites.length, 1);
  assert.equal(verification.bridgeListening, true);
  assert.equal(verification.winInetConfigured, true);
  assert.equal(verification.winHttpConfigured, false);
  assert.equal(verification.passed, false);
});
