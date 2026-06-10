import { randomUUID } from "node:crypto";

import type { Request, Response } from "express";

export const CORRELATION_ID_HEADER = "x-correlation-id";

export function getCorrelationId(request: Request): string {
  const raw = request.header(CORRELATION_ID_HEADER);
  if (raw && raw.length > 0) {
    return raw.slice(0, 128);
  }
  const existing = responseCorrelationId(request);
  if (existing) {
    return existing;
  }
  const correlationId = randomUUID();
  request.res?.setHeader(CORRELATION_ID_HEADER, correlationId);
  return correlationId;
}

export function ensureCorrelationId(
  request: Request,
  response: Response
): string {
  const raw = request.header(CORRELATION_ID_HEADER);
  const correlationId =
    raw && raw.length > 0 ? raw.slice(0, 128) : randomUUID();
  response.setHeader(CORRELATION_ID_HEADER, correlationId);
  return correlationId;
}

function responseCorrelationId(request: Request): string | null {
  const value = request.res?.getHeader(CORRELATION_ID_HEADER);
  return typeof value === "string" ? value : null;
}
