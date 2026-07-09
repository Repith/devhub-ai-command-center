import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  ApiClientError,
  apiRequest,
  formatApiClientError
} from "../lib/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("sends an in-memory bearer token and validates the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ value: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/example", z.object({ value: z.literal("ok") }), {
        accessToken: "access-token"
      })
    ).resolves.toEqual({ value: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/example",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token"
        })
      })
    );
  });

  it("exposes the shared API error envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "FORBIDDEN",
            message: "Insufficient role.",
            details: {},
            correlationId: "test-correlation"
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/json" }
          }
        )
      )
    );

    const request = apiRequest("/example", z.object({}));
    await expect(request).rejects.toBeInstanceOf(ApiClientError);
    await expect(request).rejects.toMatchObject({
      response: { code: "FORBIDDEN", correlationId: "test-correlation" }
    });
  });

  it("formats API errors with code and correlation id", () => {
    expect(
      formatApiClientError(
        new ApiClientError({
          code: "NEWS_FEED_ALREADY_EXISTS",
          message: "A news feed with this URL already exists.",
          details: {},
          correlationId: "corr-1"
        })
      )
    ).toBe(
      "NEWS_FEED_ALREADY_EXISTS: A news feed with this URL already exists. (corr-1)"
    );
  });
});
