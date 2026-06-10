import { describe, expect, it } from "vitest";

import { QdrantVectorStore } from "../src";

describe("QdrantVectorStore", () => {
  it("applies tenant filter to vector search", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const store = new QdrantVectorStore({
      url: "http://qdrant.test",
      collectionName: "documents",
      fetch: ((url, init) => {
        requests.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : null
        });
        return Promise.resolve(Response.json({ result: [] }));
      }) as typeof fetch
    });

    await store.search({
      tenantId: "tenant-a",
      vector: [0.1, 0.2],
      limit: 3,
      documentIds: ["doc-a"]
    });

    expect(requests).toEqual([
      {
        url: "http://qdrant.test/collections/documents/points/search",
        body: {
          vector: [0.1, 0.2],
          limit: 3,
          with_payload: true,
          filter: {
            must: [
              { key: "tenantId", match: { value: "tenant-a" } },
              {
                should: [{ key: "documentId", match: { value: "doc-a" } }]
              }
            ]
          }
        }
      }
    ]);
  });

  it("deletes vectors by tenant and document", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const store = new QdrantVectorStore({
      url: "http://qdrant.test",
      collectionName: "documents",
      fetch: ((url, init) => {
        requests.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : null
        });
        return Promise.resolve(Response.json({ result: {} }));
      }) as typeof fetch
    });

    await store.deleteDocument("tenant-a", "doc-a");

    expect(requests[0]).toEqual({
      url: "http://qdrant.test/collections/documents/points/delete?wait=true",
      body: {
        filter: {
          must: [
            { key: "tenantId", match: { value: "tenant-a" } },
            { key: "documentId", match: { value: "doc-a" } }
          ]
        }
      }
    });
  });

  it("returns no search results when the collection does not exist yet", async () => {
    const store = new QdrantVectorStore({
      url: "http://qdrant.test",
      collectionName: "documents",
      fetch: (() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: "not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" }
          })
        )) as typeof fetch
    });

    await expect(
      store.search({
        tenantId: "tenant-a",
        vector: [0.1, 0.2],
        limit: 3
      })
    ).resolves.toEqual([]);
  });

  it("raises a typed error when Qdrant is unavailable", async () => {
    const store = new QdrantVectorStore({
      url: "http://qdrant.test",
      collectionName: "documents",
      fetch: (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch
    });

    await expect(
      store.search({
        tenantId: "tenant-a",
        vector: [0.1, 0.2],
        limit: 3
      })
    ).rejects.toMatchObject({
      code: "VECTOR_STORE_UNAVAILABLE",
      message: "Unable to connect to Qdrant."
    });
  });
});
