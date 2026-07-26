import test from "node:test";
import assert from "node:assert/strict";

import { errorHandler } from "../src/api/middlewares/error-handler.middleware";
import { AppError } from "../src/utils/app-error";

function createResponseDouble() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };
}

function createLoggerDouble() {
  return {
    errorCalls: [] as Array<{
      payload: unknown;
      message: string;
    }>,
    error(payload: unknown, message: string) {
      this.errorCalls.push({
        payload,
        message
      });
    }
  };
}

test("error handler exposes AppError details outside production-safe mode", () => {
  const response = createResponseDouble();
  const logger = createLoggerDouble();
  const handler = errorHandler(logger as never, {
    exposeErrorDetails: true
  });

  handler(
    new AppError("Forbidden", 403, {
      reason: "policy_denied"
    }),
    {} as never,
    response as never,
    (() => undefined) as never
  );

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    error: "Forbidden",
    details: {
      reason: "policy_denied"
    }
  });
});

test("error handler hides AppError details and 5xx messages in production-safe mode", () => {
  const response = createResponseDouble();
  const logger = createLoggerDouble();
  const handler = errorHandler(logger as never, {
    exposeErrorDetails: false
  });

  handler(
    new AppError("Database connection failed", 503, {
      reason: "connect ECONNREFUSED 127.0.0.1:5432"
    }),
    {} as never,
    response as never,
    (() => undefined) as never
  );

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    error: "Internal server error"
  });
});

test("error handler preserves 4xx AppError messages in production-safe mode", () => {
  const response = createResponseDouble();
  const logger = createLoggerDouble();
  const handler = errorHandler(logger as never, {
    exposeErrorDetails: false
  });

  handler(
    new AppError("Forbidden", 403, {
      reason: "policy_denied"
    }),
    {} as never,
    response as never,
    (() => undefined) as never
  );

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    error: "Forbidden"
  });
});

test("error handler logs unexpected errors and returns a generic 500", () => {
  const response = createResponseDouble();
  const logger = createLoggerDouble();
  const handler = errorHandler(logger as never, {
    exposeErrorDetails: false
  });

  handler(
    new Error("boom"),
    {} as never,
    response as never,
    (() => undefined) as never
  );

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    error: "Internal server error"
  });
  assert.equal(logger.errorCalls.length, 1);
  assert.equal(logger.errorCalls[0]?.message, "Unhandled request error");
});
