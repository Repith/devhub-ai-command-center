import type { NextFunction, Request, Response } from "express";

import { ensureCorrelationId } from "./request-context";

export function requestLoggingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const startedAt = performance.now();
  const correlationId = ensureCorrelationId(request, response);

  response.on("finish", () => {
    const durationMs = Math.round(performance.now() - startedAt);
    console.log(
      JSON.stringify({
        level: response.statusCode >= 500 ? "error" : "info",
        event: "http_request",
        correlationId,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        durationMs
      })
    );
  });

  next();
}
