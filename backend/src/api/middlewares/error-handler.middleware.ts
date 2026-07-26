import { NextFunction, Request, Response } from "express";
import { Logger } from "pino";

import { AppError } from "../../utils/app-error";

interface ErrorHandlerOptions {
  exposeErrorDetails?: boolean;
}

function shouldExposeErrorDetails(options: ErrorHandlerOptions): boolean {
  if (typeof options.exposeErrorDetails === "boolean") {
    return options.exposeErrorDetails;
  }

  return process.env.NODE_ENV !== "production";
}

export function errorHandler(
  logger: Logger,
  options: ErrorHandlerOptions = {}
) {
  const exposeErrorDetails = shouldExposeErrorDetails(options);

  return (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction
  ) => {
    if (error instanceof AppError) {
      const errorMessage =
        error.statusCode >= 500 && !exposeErrorDetails
          ? "Internal server error"
          : error.message;

      response.status(error.statusCode).json({
        error: errorMessage,
        ...(exposeErrorDetails && error.details !== undefined
          ? {
              details: error.details
            }
          : {})
      });
      return;
    }

    logger.error({ error }, "Unhandled request error");
    response.status(500).json({
      error: "Internal server error"
    });
  };
}
