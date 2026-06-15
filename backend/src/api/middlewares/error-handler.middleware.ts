import { NextFunction, Request, Response } from "express";
import { Logger } from "pino";

import { AppError } from "../../utils/app-error";

export function errorHandler(logger: Logger) {
  return (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction
  ) => {
    if (error instanceof AppError) {
      response.status(error.statusCode).json({
        error: error.message,
        details: error.details
      });
      return;
    }

    logger.error({ error }, "Unhandled request error");
    response.status(500).json({
      error: "Internal server error"
    });
  };
}
