import { HttpStatus } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { getCorrelationId } from "./request-context";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitConfig {
  enabled: boolean;
  limit: number;
  windowMs: number;
}

export function loadRateLimitConfig(): RateLimitConfig {
  return {
    enabled: process.env.RATE_LIMIT_ENABLED !== "false",
    limit: Number(process.env.RATE_LIMIT_MAX ?? 120),
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000)
  };
}

export function createRateLimitMiddleware(config: RateLimitConfig) {
  const buckets = new Map<string, RateLimitBucket>();

  return (request: Request, response: Response, next: NextFunction): void => {
    if (!config.enabled || request.method === "OPTIONS") {
      next();
      return;
    }
    const now = Date.now();
    const key = `${clientIp(request)}:${request.method}:${request.path}`;
    const current = buckets.get(key);
    const bucket =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + config.windowMs };
    bucket.count += 1;
    buckets.set(key, bucket);

    response.setHeader("RateLimit-Limit", String(config.limit));
    response.setHeader(
      "RateLimit-Remaining",
      String(Math.max(0, config.limit - bucket.count))
    );
    response.setHeader(
      "RateLimit-Reset",
      String(Math.ceil(bucket.resetAt / 1000))
    );

    if (bucket.count > config.limit) {
      response.status(HttpStatus.TOO_MANY_REQUESTS).json({
        code: "RATE_LIMITED",
        message: "Too many requests. Please retry after the rate limit window.",
        details: { retryAfterMs: Math.max(0, bucket.resetAt - now) },
        correlationId: getCorrelationId(request)
      });
      return;
    }

    next();
  };
}

function clientIp(request: Request): string {
  const forwarded = request.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.ip || request.socket.remoteAddress || "unknown";
}
