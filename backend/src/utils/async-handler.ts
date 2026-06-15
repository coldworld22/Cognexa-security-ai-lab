import { NextFunction, Request, Response } from "express";

export type RequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction
) => Promise<unknown>;

export function asyncHandler(handler: RequestHandler) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}
