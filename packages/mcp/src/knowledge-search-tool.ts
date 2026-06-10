import type { EmbeddingProviderPort } from "@devhub/ai";
import {
  knowledgeSearchResponseSchema,
  knowledgeSearchToolInputSchema,
  type KnowledgeSearchResponse,
  type KnowledgeSearchToolInput,
  type McpTenantContext
} from "@devhub/contracts";
import type { PrismaDocumentRepository } from "@devhub/database";
import type { VectorSearchHit, VectorStorePort } from "@devhub/rag";

import type { ToolDefinition } from "./tool-registry.js";

export interface KnowledgeSearchToolOptions {
  documents: PrismaDocumentRepository;
  embeddingModel: string;
  embeddingProvider: EmbeddingProviderPort;
  embeddingTimeoutMs: number;
  vectorStore: VectorStorePort;
}

export function createKnowledgeSearchTool(
  options: KnowledgeSearchToolOptions
): ToolDefinition<KnowledgeSearchToolInput, KnowledgeSearchResponse> {
  return {
    id: "knowledge.search",
    description: "Search indexed tenant knowledge chunks with citations.",
    inputSchema: knowledgeSearchToolInputSchema,
    outputSchema: knowledgeSearchResponseSchema,
    execute: (input, context) => searchKnowledge(options, input, context)
  };
}

async function searchKnowledge(
  options: KnowledgeSearchToolOptions,
  input: KnowledgeSearchToolInput,
  context: McpTenantContext
): Promise<KnowledgeSearchResponse> {
  const embeddings = await options.embeddingProvider.embed({
    model: options.embeddingModel,
    texts: [input.query],
    timeoutMs: options.embeddingTimeoutMs
  });
  const [queryVector] = embeddings.vectors;
  if (!queryVector) {
    return { query: input.query, results: [] };
  }

  const hits = await options.vectorStore.search({
    vector: queryVector,
    tenantId: context.tenantId,
    limit: input.limit,
    ...(input.documentIds ? { documentIds: input.documentIds } : {})
  });
  const chunks = await options.documents.findIndexedChunksByIds(
    context,
    hits.map((hit) => hit.payload.chunkId)
  );
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  return {
    query: input.query,
    results: hits.flatMap((hit) => {
      const chunk = chunkById.get(hit.payload.chunkId);
      if (!chunk || !chunk.document) {
        return [];
      }
      return [
        {
          citationLabel: citationLabel(hit),
          score: hit.score,
          documentId: chunk.documentId,
          chunkId: chunk.id,
          fileName: chunk.document.fileName,
          ordinal: chunk.ordinal,
          pageNumber: chunk.pageNumber,
          content: chunk.content
        }
      ];
    })
  };
}

function citationLabel(hit: VectorSearchHit): string {
  return `doc:${hit.payload.documentId.slice(0, 8)}#${hit.payload.ordinal}`;
}
