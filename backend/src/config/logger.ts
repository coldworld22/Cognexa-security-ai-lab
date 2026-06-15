import pino from "pino";

import { env } from "./env";

export function createLogger() {
  const options =
    env.NODE_ENV === "production"
      ? {
          level: "info" as const
        }
      : {
          level: "debug" as const,
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard"
            }
          }
        };

  return pino({
    ...options,
  });
}
