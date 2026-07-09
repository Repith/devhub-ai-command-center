import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  gmailCreateDraftInputSchema,
  gmailGetThreadInputSchema,
  gmailSearchThreadsInputSchema,
  gmailUpdateDraftInputSchema,
  type McpTenantContext
} from "@devhub/contracts";
import {
  createGmailCreateDraftTool,
  createGmailGetThreadTool,
  createGmailSearchThreadsTool,
  createGmailUpdateDraftTool
} from "@devhub/mcp";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "devhub-mcp-gmail",
    version: "0.0.0"
  });
  const options = {
    getAccessToken: async () => diagnosticAccessToken()
  };

  const searchTool = createGmailSearchThreadsTool(options);
  server.registerTool(
    searchTool.id,
    {
      title: "Search Gmail threads",
      description: searchTool.description,
      inputSchema: {
        query: gmailSearchThreadsInputSchema.shape.query,
        maxResults: gmailSearchThreadsInputSchema.shape.maxResults
      }
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await searchTool.execute(input, serverContext))
        }
      ]
    })
  );

  const getThreadTool = createGmailGetThreadTool(options);
  server.registerTool(
    getThreadTool.id,
    {
      title: "Get Gmail thread",
      description: getThreadTool.description,
      inputSchema: {
        threadId: gmailGetThreadInputSchema.shape.threadId
      }
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            await getThreadTool.execute(input, serverContext)
          )
        }
      ]
    })
  );

  const createDraftTool = createGmailCreateDraftTool(options);
  server.registerTool(
    createDraftTool.id,
    {
      title: "Create Gmail draft",
      description: createDraftTool.description,
      inputSchema: {
        threadId: gmailCreateDraftInputSchema.shape.threadId,
        to: gmailCreateDraftInputSchema.shape.to,
        cc: gmailCreateDraftInputSchema.shape.cc,
        subject: gmailCreateDraftInputSchema.shape.subject,
        body: gmailCreateDraftInputSchema.shape.body
      }
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            await createDraftTool.execute(input, serverContext)
          )
        }
      ]
    })
  );

  const updateDraftTool = createGmailUpdateDraftTool(options);
  server.registerTool(
    updateDraftTool.id,
    {
      title: "Update Gmail draft",
      description: updateDraftTool.description,
      inputSchema: {
        draftId: gmailUpdateDraftInputSchema.shape.draftId,
        threadId: gmailUpdateDraftInputSchema.shape.threadId,
        to: gmailUpdateDraftInputSchema.shape.to,
        cc: gmailUpdateDraftInputSchema.shape.cc,
        subject: gmailUpdateDraftInputSchema.shape.subject,
        body: gmailUpdateDraftInputSchema.shape.body
      }
    },
    async (input) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(
            await updateDraftTool.execute(input, serverContext)
          )
        }
      ]
    })
  );

  await server.connect(new StdioServerTransport());
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for diagnostic Gmail MCP mode.`);
  }
  return value;
}

function diagnosticAccessToken(): string {
  if (process.env.GMAIL_MCP_DIAGNOSTIC_MODE !== "true") {
    throw new Error(
      "apps/mcp-gmail is a local diagnostic server. Production Gmail tools use the API/worker server-side token provider; set GMAIL_MCP_DIAGNOSTIC_MODE=true only for local diagnostics."
    );
  }
  return requiredEnv("GMAIL_ACCESS_TOKEN");
}

const serverContext: McpTenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000000",
  userId: "00000000-0000-0000-0000-000000000000",
  correlationId: "mcp-gmail-stdio"
};

void main();
