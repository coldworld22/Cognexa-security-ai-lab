import { Response } from "express";

export function initializeSse(response: Response): void {
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
}

export function sendSseEvent(
  response: Response,
  event: string,
  data: unknown
): void {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}
