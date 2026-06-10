import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { createRateLimitMiddleware } from "../src/common/rate-limit.middleware";

describe("rate limit middleware", () => {
  it("rejects requests after the configured window budget", () => {
    const middleware = createRateLimitMiddleware({
      enabled: true,
      limit: 1,
      windowMs: 60_000
    });
    let nextCalls = 0;
    const next = (): void => {
      nextCalls += 1;
    };
    const first = fakeResponse();
    const second = fakeResponse();

    middleware(fakeRequest(), first.response, next);
    middleware(fakeRequest(), second.response, next);

    expect(nextCalls).toBe(1);
    expect(second.statusCode).toBe(429);
    expect(second.body).toMatchObject({
      code: "RATE_LIMITED"
    });
  });
});

function fakeRequest(): Request {
  return {
    method: "GET",
    path: "/api/v1/agents",
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    header: (name: string) =>
      name.toLowerCase() === "x-correlation-id" ? "test-correlation" : undefined
  } as Request;
}

function fakeResponse(): {
  response: Response;
  statusCode: number;
  body: unknown;
} {
  const state = {
    statusCode: 200,
    body: undefined as unknown
  };
  const response = {
    setHeader: vi.fn(),
    status: vi.fn((statusCode: number) => {
      state.statusCode = statusCode;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      state.body = body;
      return response;
    })
  } as unknown as Response;
  return {
    response,
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    }
  };
}
