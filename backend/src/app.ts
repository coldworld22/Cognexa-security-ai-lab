import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { AppContext } from "./bootstrap/app-context";
import { env } from "./config/env";
import { createApiRouter } from "./api/routes";
import { createAdminIpAllowlistMiddleware } from "./api/middlewares/admin-ip-allowlist.middleware";
import { errorHandler } from "./api/middlewares/error-handler.middleware";
import { createHttpsEnforcementMiddleware } from "./api/middlewares/https-enforcement.middleware";
import { notFoundHandler } from "./api/middlewares/not-found.middleware";

export function createApp(context: AppContext) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(
    createHttpsEnforcementMiddleware({
      forceHttps: env.FORCE_HTTPS,
      httpsPort: env.HTTPS_ENABLED ? env.PORT : null
    })
  );
  app.use(
    cors({
      origin: true,
      credentials: true
    })
  );
  app.use(
    helmet({
      // Do not advertise HSTS while the local stack is intentionally running over HTTP.
      strictTransportSecurity: env.HTTPS_ENABLED || env.FORCE_HTTPS
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger: context.logger
    })
  );

  app.get("/health", async (_request, response) => {
    const snapshot = await context.services.health.getSnapshot();
    response.json(snapshot);
  });

  app.use(
    `${env.API_PREFIX}/admin`,
    createAdminIpAllowlistMiddleware(env.ADMIN_IP_ALLOWLIST)
  );
  app.use(env.API_PREFIX, createApiRouter(context));
  app.use(notFoundHandler);
  app.use(errorHandler(context.logger));

  return app;
}
