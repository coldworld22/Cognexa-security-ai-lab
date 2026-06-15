import { Request, Response } from "express";

export function notFoundHandler(_request: Request, response: Response) {
  response.status(404).json({
    error: "Route not found"
  });
}
