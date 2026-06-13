import {
  documentChunkListSchema,
  documentListSchema,
  documentSchema,
  knowledgeSearchRequestSchema,
  knowledgeSearchResponseSchema,
  knowledgeSearchStreamEventSchema,
  type Document,
  type DocumentChunk,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResponse,
  type KnowledgeSearchStreamEvent
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

export async function deleteDocument(
  accessToken: string,
  documentId: string
): Promise<void> {
  const response = await fetch(`/api/v1/documents/${documentId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new ApiClientError(await parseApiError(response));
  }
}

export async function reindexDocument(
  accessToken: string,
  documentId: string
): Promise<Document> {
  const response = await fetch(`/api/v1/documents/${documentId}/reindex`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new ApiClientError(await parseApiError(response));
  }

  return documentSchema.parse(await response.json());
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

export async function streamKnowledgeSearch(
  accessToken: string,
  input: KnowledgeSearchRequest,
  onEvent: (event: KnowledgeSearchStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch("/api/v1/documents/search/stream", {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(knowledgeSearchRequestSchema.parse(input)),
    ...(signal ? { signal } : {})
  });

  if (!response.ok) {
    throw new ApiClientError(await parseApiError(response));
  }
  if (!response.body) {
    throw new Error("The knowledge search stream is unavailable.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      emitKnowledgeLine(line, onEvent);
    }
    if (done) {
      break;
    }
  }
  emitKnowledgeLine(buffer, onEvent);
}

function emitKnowledgeLine(
  line: string,
  onEvent: (event: KnowledgeSearchStreamEvent) => void
): void {
  const trimmed = line.trim();
  if (trimmed) {
    onEvent(knowledgeSearchStreamEventSchema.parse(JSON.parse(trimmed)));
  }
}
