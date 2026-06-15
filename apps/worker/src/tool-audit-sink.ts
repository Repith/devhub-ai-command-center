import type { McpToolAuditEntry } from "@devhub/contracts";
import type { CreateAuditLogInput } from "@devhub/database";
import type { ToolAuditSink } from "@devhub/mcp";

const maxPersistedPreviewLength = 2000;
const gmailRedactedPreview = "[redacted:gmail-tool-payload]";

interface ToolAuditLogRepository {
  record(
    context: {
      tenantId: string;
      userId?: string | null;
      correlationId: string;
    },
    input: CreateAuditLogInput
  ): Promise<void>;
}

export class PrismaToolAuditSink implements ToolAuditSink {
  public constructor(private readonly auditLogs: ToolAuditLogRepository) {}

  public async record(entry: McpToolAuditEntry): Promise<void> {
    const context = {
      tenantId: entry.tenantId,
      userId: null,
      correlationId: entry.correlationId
    };
    await this.auditLogs.record(context, {
      action: `mcp.tool.${entry.status.toLowerCase()}`,
      resourceType: "mcp_tool",
      resourceId: entry.toolId,
      metadata: {
        agentId: entry.agentId,
        toolId: entry.toolId,
        status: entry.status,
        correlationId: entry.correlationId,
        durationMs: entry.durationMs,
        errorCode: entry.errorCode,
        inputPreview: safePreview(entry.toolId, entry.inputPreview),
        outputPreview:
          entry.outputPreview === null
            ? null
            : safePreview(entry.toolId, entry.outputPreview)
      }
    });
  }
}

function safePreview(
  toolId: McpToolAuditEntry["toolId"],
  value: string
): string {
  if (toolId.startsWith("gmail.")) {
    return gmailRedactedPreview;
  }
  return value.length > maxPersistedPreviewLength
    ? `${value.slice(0, maxPersistedPreviewLength)}...`
    : value;
}
