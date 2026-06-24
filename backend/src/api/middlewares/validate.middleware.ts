import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";

export function validateBody(schema: ZodTypeAny) {
  return (request: Request, response: Response, next: NextFunction) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      response.status(400).json({
        error: "Validation failed",
        issues: result.error.issues
      });
      return;
    }

    request.body = result.data;
    next();
  };
}

export function validateParams(schema: ZodTypeAny) {
  return (request: Request, response: Response, next: NextFunction) => {
    const result = schema.safeParse(request.params);
    if (!result.success) {
      response.status(400).json({
        error: "Validation failed",
        issues: result.error.issues
      });
      return;
    }

    Object.assign(request.params, result.data);
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (request: Request, response: Response, next: NextFunction) => {
    const result = schema.safeParse(request.query);
    if (!result.success) {
      response.status(400).json({
        error: "Validation failed",
        issues: result.error.issues
      });
      return;
    }

    // Express recomputes `request.query` from the raw URL, so mutate-by-assign
    // does not reliably preserve coerced values for downstream handlers.
    Object.defineProperty(request, "query", {
      value: result.data,
      configurable: true,
      enumerable: true,
      writable: true
    });
    next();
  };
}
