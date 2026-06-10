import {
  documentChunkListSchema,
  documentListSchema,
  documentSchema,
  knowledgeSearchResponseSchema,
  type Document,
  type DocumentChunk,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse
} from "@devhub/contracts";

import { ApiClientError, apiRequest, parseApiError } from "./api-client";

export async function listDocuments(accessToken: string): Promise<Document[]> {
  const response = await apiRequest("/documents", documentListSchema, {
    accessToken
  });
  return response.data;
}

export async function uploadDocument(
  accessToken: string,
  file: File
): Promise<Document> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/v1/documents", {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form
  });

  if (!response.ok) {
    throw new ApiClientError(await parseApiError(response));
  }

  return documentSchema.parse(await response.json());
}

export async function listDocumentChunks(
  accessToken: string,
  documentId: string
): Promise<DocumentChunk[]> {
  const response = await apiRequest(
    `/documents/${documentId}/chunks`,
    documentChunkListSchema,
    { accessToken }
  );
  return response.data;
}

export function searchKnowledge(
  accessToken: string,
  input: KnowledgeSearchRequest
): Promise<KnowledgeSearchResponse> {
  return apiRequest("/documents/search", knowledgeSearchResponseSchema, {
    method: "POST",
    accessToken,
    body: input
  });
}
