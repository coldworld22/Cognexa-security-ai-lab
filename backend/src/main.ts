import type { Server } from "http";
import type { IncomingMessage } from "http";

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

  const server = app.listen(env.PORT, () => {
    context.logger.info(
      {
        port: env.PORT,
        environment: env.NODE_ENV
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

function closeServer(server: Server): Promise<void> {
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
