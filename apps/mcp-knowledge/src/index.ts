import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { OllamaOpenAiEmbeddingProvider } from "@devhub/ai";
import {
  mcpTenantContextSchema,
  knowledgeSearchToolInputSchema
} from "@devhub/contracts";
import {
  createDatabaseClient,
  PrismaDocumentRepository
} from "@devhub/database";
import { createKnowledgeSearchTool } from "@devhub/mcp";
import { QdrantVectorStore } from "@devhub/rag";

import { loadKnowledgeServerConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadKnowledgeServerConfig();
  const database = createDatabaseClient(config.databaseUrl);
  const tool = createKnowledgeSearchTool({
    documents: new PrismaDocumentRepository(database),
    embeddingModel: config.embeddingModel,
    embeddingProvider: new OllamaOpenAiEmbeddingProvider({
      baseUrl: config.ollamaBaseUrl,
      apiKey: config.ollamaApiKey
    }),
    embeddingTimeoutMs: config.embeddingTimeoutMs,
    vectorStore: new QdrantVectorStore({
      url: config.qdrantUrl,
      collectionName: config.qdrantCollectionName
    })
  });

  const server = new McpServer({
    name: "devhub-mcp-knowledge",
    version: "0.0.0"
  });

  server.registerTool(
    tool.id,
    {
      title: "Search tenant knowledge",
      description: tool.description,
      inputSchema: {
        query: knowledgeSearchToolInputSchema.shape.query,
        limit: knowledgeSearchToolInputSchema.shape.limit,
        documentIds: knowledgeSearchToolInputSchema.shape.documentIds,
        tenantId: mcpTenantContextSchema.shape.tenantId,
        userId: mcpTenantContextSchema.shape.userId,
        correlationId: mcpTenantContextSchema.shape.correlationId
      }
    },
    async (input) => {
      const context = mcpTenantContextSchema.parse(input);
      const toolInput = knowledgeSearchToolInputSchema.parse(input);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(await tool.execute(toolInput, context))
          }
        ]
      };
    }
  );

  await server.connect(new StdioServerTransport());
}

void main();
