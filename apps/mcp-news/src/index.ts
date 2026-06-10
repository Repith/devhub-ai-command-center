import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  newsFetchRssInputSchema,
  type McpTenantContext
} from "@devhub/contracts";
import { createNewsFetchRssTool } from "@devhub/mcp";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "devhub-mcp-news",
    version: "0.0.0"
  });
  const tool = createNewsFetchRssTool();

  server.registerTool(
    tool.id,
    {
      title: "Fetch RSS feed",
      description: tool.description,
      inputSchema: {
        url: newsFetchRssInputSchema.shape.url,
        limit: newsFetchRssInputSchema.shape.limit
      }
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await tool.execute(input, serverContext))
        }
      ]
    })
  );

  await server.connect(new StdioServerTransport());
}

const serverContext: McpTenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000000",
  userId: "00000000-0000-0000-0000-000000000000",
  correlationId: "mcp-news-stdio"
};

void main();
