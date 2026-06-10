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
});
