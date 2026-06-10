import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadDocument } from "../lib/documents-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("documents-api", () => {
  it("uploads documents as multipart form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "64fe81ba-7faf-4b37-a2b8-347cd19b5550",
          fileName: "guide.md",
          mimeType: "text/markdown",
          sizeBytes: 12,
          checksum: "sha256",
          status: "UPLOADED",
          failureCode: null,
          failureDetail: null,
          chunkCount: 0,
          createdAt: "2026-06-10T12:00:00.000Z",
          updatedAt: "2026-06-10T12:00:00.000Z"
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["hello"], "guide.md", { type: "text/markdown" });
    await expect(uploadDocument("access-token", file)).resolves.toMatchObject({
      fileName: "guide.md",
      status: "UPLOADED"
    });

    const [, request] = fetchMock.mock.calls[0]!;
    expect(request).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: { Authorization: "Bearer access-token" }
    });
    expect(request.body).toBeInstanceOf(FormData);
  });
});
