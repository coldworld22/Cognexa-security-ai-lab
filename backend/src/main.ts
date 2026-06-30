import { createServer as createHttpServer, type IncomingMessage } from "http";
import type { Server as HttpServer } from "http";
import { readFileSync } from "fs";
import { createServer as createHttpsServer, type Server as HttpsServer } from "https";
import { resolve } from "path";

import { createApp } from "./app";
import { createAppContext } from "./bootstrap/create-app-context";
import { env } from "./config/env";
import { WebSocket, WebSocketServer } from "ws";

async function bootstrap(): Promise<void> {
  const context = await createAppContext();
  const app = createApp(context);
  let shuttingDown = false;
  const wss = new WebSocketServer({
    noServer: true
  });
  const server = createHttpListener(app, context.logger);

  server.listen(env.PORT, () => {
    context.logger.info(
      {
        port: env.PORT,
        environment: env.NODE_ENV,
        protocol: env.HTTPS_ENABLED ? "https" : "http"
      },
      "Security AI Lab backend started"
    );
  });

  server.on("upgrade", (request, socket, head) => {
    void handleWebSocketUpgrade(request, socket, head);
  });

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    context.logger.info({ signal }, "Shutdown signal received");

    try {
      await closeWebSocketServer(wss);
      await closeServer(server);
      if (context.redis.isOpen) {
        await context.redis.quit();
      }
      await context.postgres.end();
      context.logger.info("Shutdown completed");
      process.exit(0);
    } catch (error) {
      context.logger.error({ error, signal }, "Graceful shutdown failed");
      process.exit(1);
    }
  };

  async function handleWebSocketUpgrade(
    request: IncomingMessage,
    socket: import("stream").Duplex,
    head: Buffer
  ) {
    try {
      const url = new URL(
        request.url ?? "/",
        `http://${request.headers.host ?? "localhost"}`
      );

      if (url.pathname !== `${env.API_PREFIX}/admin/network/ws`) {
        socket.destroy();
        return;
      }

      const accessToken = url.searchParams.get("access_token");
      if (!accessToken) {
        socket.destroy();
        return;
      }

      const payload = context.services.auth.verifyAccessToken(accessToken);
      const actor = await context.services.authorization.getUserAccessContext(
        payload.sub as string,
        payload.email as string
      );
      await context.services.authorization.assertPermission(actor, "admin_dashboard", {
        layer: "route",
        resource: "admin.network.ws",
        action: "GET /admin/network/ws",
        reason: "Network monitor live updates require 'admin_dashboard' permission",
        metadata: {
          ip: request.socket.remoteAddress
        }
      });

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } catch (error) {
      context.logger.warn({ error }, "Rejected admin network websocket upgrade");
      socket.destroy();
    }
  }

  wss.on("connection", (socket: WebSocket) => {
    const sendJson = (payload: unknown) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    };

    const unsubscribe = context.services.endpoints.subscribeToNetworkEvents((event) => {
      sendJson(event);
    });

    void context.services.endpoints
      .getCurrentNetworkSnapshot()
      .then((snapshot) => {
        sendJson({
          type: "snapshot",
          snapshot
        });
      })
      .catch((error) => {
        sendJson({
          type: "job",
          job: {
            id: "snapshot-error",
            kind: "scan",
            state: "failed",
            totalTargets: 0,
            scannedTargets: 0,
            discoveredHosts: 0,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            error:
              error instanceof Error
                ? error.message
                : "Failed to load the current network snapshot."
          }
        });
      });

    socket.on("close", () => {
      unsubscribe();
    });

    socket.on("error", () => {
      unsubscribe();
    });
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}

bootstrap().catch((error: unknown) => {
  console.error("Failed to bootstrap backend", error);
  process.exit(1);
});

function closeServer(server: HttpServer | HttpsServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        if (isIgnorableCloseError(error)) {
          resolve();
          return;
        }

        reject(error);
        return;
      }

      resolve();
    });
  });
}

function closeWebSocketServer(server: WebSocketServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        if (isIgnorableCloseError(error)) {
          resolve();
          return;
        }

        reject(error);
        return;
      }

      resolve();
    });
  });
}

function isIgnorableCloseError(error: Error & { code?: string }): boolean {
  return error.code === "ERR_SERVER_NOT_RUNNING";
}

function createHttpListener(
  app: ReturnType<typeof createApp>,
  logger: Awaited<ReturnType<typeof createAppContext>>["logger"]
): HttpServer | HttpsServer {
  if (!env.HTTPS_ENABLED) {
    return createHttpServer(app);
  }

  const keyPath = requireTlsFile(env.HTTPS_KEY_FILE, "HTTPS_KEY_FILE");
  const certPath = requireTlsFile(env.HTTPS_CERT_FILE, "HTTPS_CERT_FILE");
  const caPath = env.HTTPS_CA_FILE?.trim()
    ? resolve(process.cwd(), env.HTTPS_CA_FILE)
    : undefined;

  logger.info(
    {
      keyPath,
      certPath,
      caPath
    },
    "Starting backend with local HTTPS enabled"
  );

  return createHttpsServer(
    {
      key: readFileSync(keyPath),
      cert: readFileSync(certPath),
      ...(caPath ? { ca: readFileSync(caPath) } : {})
    },
    app
  );
}

function requireTlsFile(value: string | undefined, envName: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(
      `${envName} must be set when HTTPS_ENABLED=true. Run 'npm run certs:dev' and then start the HTTPS dev scripts.`
    );
  }

  return resolve(process.cwd(), trimmed);
}
