export interface VectorPayload {
  tenantId: string;
  documentId: string;
  chunkId: string;
  ordinal: number;
}

export interface VectorPoint {
  id: string;
  vector: readonly number[];
  payload: VectorPayload;
}

export interface VectorSearchInput {
  vector: readonly number[];
  tenantId: string;
  limit: number;
  documentIds?: readonly string[];
}

export interface VectorSearchHit {
  id: string;
  score: number;
  payload: VectorPayload;
}

export interface VectorStorePort {
  readonly name: string;
  upsert(points: readonly VectorPoint[]): Promise<void>;
  deleteDocument(tenantId: string, documentId: string): Promise<void>;
  search(input: VectorSearchInput): Promise<readonly VectorSearchHit[]>;
}

export class VectorStoreError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "VectorStoreError";
  }
}
