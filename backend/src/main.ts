import type { Server } from "http";

import { createApp } from "./app";
import { createAppContext } from "./bootstrap/create-app-context";
import { env } from "./config/env";

async function bootstrap(): Promise<void> {
  const context = await createAppContext();
  const app = createApp(context);
  let shuttingDown = false;

  const server = app.listen(env.PORT, () => {
    context.logger.info(
      {
        port: env.PORT,
        environment: env.NODE_ENV
      },
      "Security AI Lab backend started"
    );
  });

  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    context.logger.info({ signal }, "Shutdown signal received");

    try {
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
        reject(error);
        return;
      }

      resolve();
    });
  });
}
