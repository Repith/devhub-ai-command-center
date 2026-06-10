import { z } from "zod";

import {
  VectorStoreError,
  type VectorPayload,
  type VectorPoint,
  type VectorSearchHit,
  type VectorSearchInput,
  type VectorStorePort
} from "./vector-store.js";

const qdrantPayloadSchema = z.object({
  tenantId: z.string(),
  documentId: z.string(),
  chunkId: z.string(),
  ordinal: z.number().int().nonnegative()
});

const qdrantSearchResponseSchema = z.object({
  result: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      score: z.number(),
      payload: qdrantPayloadSchema
    })
  )
});

export interface QdrantVectorStoreOptions {
  url?: string;
  collectionName?: string;
  fetch?: typeof fetch;
}

export class QdrantVectorStore implements VectorStorePort {
  public readonly name = "qdrant";

  private readonly url: string;
  private readonly collectionName: string;
  private readonly request: typeof fetch;
  private collectionVectorSize: number | undefined;

  public constructor(options: QdrantVectorStoreOptions = {}) {
    this.url = (options.url ?? "http://localhost:6333").replace(/\/+$/, "");
    this.collectionName = options.collectionName ?? "devhub_document_chunks";
    this.request = options.fetch ?? fetch;
  }

  public async upsert(points: readonly VectorPoint[]): Promise<void> {
    if (points.length === 0) {
      return;
    }
    const [firstPoint] = points;
    if (!firstPoint) {
      return;
    }
    await this.ensureCollection(firstPoint.vector.length);
    await this.qdrant(`/collections/${this.collectionName}/points?wait=true`, {
      method: "PUT",
      body: {
        points: points.map((point) => ({
          id: point.id,
          vector: point.vector,
          payload: point.payload
        }))
      }
    });
  }

  public async deleteDocument(
    tenantId: string,
    documentId: string
  ): Promise<void> {
    await this.qdrant(
      `/collections/${this.collectionName}/points/delete?wait=true`,
      {
        method: "POST",
        body: { filter: documentFilter(tenantId, documentId) },
        allowNotFound: true
      }
    );
  }

  public async search(
    input: VectorSearchInput
  ): Promise<readonly VectorSearchHit[]> {
    const response = await this.qdrant(
      `/collections/${this.collectionName}/points/search`,
      {
        method: "POST",
        body: {
          vector: input.vector,
          limit: input.limit,
          with_payload: true,
          filter: searchFilter(input)
        }
      }
    );
    const parsed = qdrantSearchResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new VectorStoreError(
        "VECTOR_STORE_INVALID_RESPONSE",
        "Qdrant returned an invalid search response.",
        { cause: parsed.error }
      );
    }
    return parsed.data.result.map((hit) => ({
      id: hit.id,
      score: hit.score,
      payload: hit.payload
    }));
  }

  private async ensureCollection(vectorSize: number): Promise<void> {
    if (this.collectionVectorSize === vectorSize) {
      return;
    }

    const response = await this.request(
      `${this.url}/collections/${this.collectionName}`
    );
    if (response.status === 404) {
      await this.qdrant(`/collections/${this.collectionName}`, {
        method: "PUT",
        body: { vectors: { size: vectorSize, distance: "Cosine" } }
      });
      this.collectionVectorSize = vectorSize;
      return;
    }
    if (!response.ok) {
      throw new VectorStoreError(
        "VECTOR_STORE_REQUEST_FAILED",
        `Qdrant returned HTTP ${response.status}.`
      );
    }
    this.collectionVectorSize = vectorSize;
  }

  private async qdrant(
    path: string,
    options: {
      method: "POST" | "PUT";
      body: unknown;
      allowNotFound?: boolean;
    }
  ): Promise<unknown> {
    const response = await this.request(`${this.url}${path}`, {
      method: options.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options.body)
    });
    if (options.allowNotFound && response.status === 404) {
      return {};
    }
    if (!response.ok) {
      throw new VectorStoreError(
        "VECTOR_STORE_REQUEST_FAILED",
        `Qdrant returned HTTP ${response.status}: ${await response.text()}`
      );
    }
    return response.json() as Promise<unknown>;
  }
}

function documentFilter(tenantId: string, documentId: string): object {
  return {
    must: [
      matchPayload("tenantId", tenantId),
      matchPayload("documentId", documentId)
    ]
  };
}

function searchFilter(input: VectorSearchInput): object {
  const must: object[] = [matchPayload("tenantId", input.tenantId)];
  if (input.documentIds && input.documentIds.length > 0) {
    must.push({
      should: input.documentIds.map((documentId) =>
        matchPayload("documentId", documentId)
      )
    });
  }
  return { must };
}

function matchPayload(key: keyof VectorPayload, value: string): object {
  return { key, match: { value } };
}
