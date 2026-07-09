import type { CreateAuditLogInput } from "@devhub/database";
import type { TenantContext } from "@devhub/domain";
import { describe, expect, it } from "vitest";

import { PrismaToolAuditSink } from "../src/tool-audit-sink";

describe("PrismaToolAuditSink", () => {
  it("persists completed, failed, and denied MCP audit entries", async () => {
    const records: {
      context: Pick<TenantContext, "tenantId" | "correlationId"> & {
        userId?: string | null;
      };
      input: CreateAuditLogInput;
    }[] = [];
    const sink = new PrismaToolAuditSink({
      record: (context, input) => {
        records.push({ context, input });
        return Promise.resolve();
      }
    });

    await sink.record(entry("COMPLETED", "news.fetch_rss"));
    await sink.record(entry("FAILED", "usage.summary", "TOOL_CALL_FAILED"));
    await sink.record(entry("DENIED", "knowledge.search", "TOOL_NOT_ALLOWED"));

    expect(records.map((record) => record.input.action)).toEqual([
      "mcp.tool.completed",
      "mcp.tool.failed",
      "mcp.tool.denied"
    ]);
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          context: expect.objectContaining({
            tenantId,
            userId: null,
            correlationId: "audit-correlation"
          }),
          input: expect.objectContaining({
            resourceType: "mcp_tool",
            resourceId: "news.fetch_rss",
            metadata: expect.objectContaining({
              status: "COMPLETED",
              toolId: "news.fetch_rss"
            })
          })
        })
      ])
    );
  });

  it("bounds persisted previews and redacts Gmail and GitHub payloads", async () => {
    const records: CreateAuditLogInput[] = [];
    const sink = new PrismaToolAuditSink({
      record: (_context, input) => {
        records.push(input);
        return Promise.resolve();
      }
    });

    await sink.record(entry("COMPLETED", "news.fetch_rss", null, 2500));
    await sink.record(entry("COMPLETED", "gmail.get_thread"));
    await sink.record(entry("COMPLETED", "github.get_file"));

    const newsMetadata = records[0]!.metadata as Record<string, unknown>;
    const gmailMetadata = records[1]!.metadata as Record<string, unknown>;
    const githubMetadata = records[2]!.metadata as Record<string, unknown>;
    expect((newsMetadata.inputPreview as string).length).toBeLessThanOrEqual(
      2003
    );
    expect(JSON.stringify(gmailMetadata)).not.toContain("SECRET_BODY");
    expect(gmailMetadata).toMatchObject({
      inputPreview: "[redacted:gmail-tool-payload]",
      outputPreview: "[redacted:gmail-tool-payload]"
    });
    expect(JSON.stringify(githubMetadata)).not.toContain("SECRET_BODY");
    expect(githubMetadata).toMatchObject({
      inputPreview: "[redacted:github-tool-payload]",
      outputPreview: "[redacted:github-tool-payload]"
    });
  });
});

const tenantId = "00000000-0000-0000-0000-000000000001";
const agentId = "00000000-0000-0000-0000-000000000002";

function entry(
  status: "COMPLETED" | "FAILED" | "DENIED",
  toolId:
    | "knowledge.search"
    | "news.fetch_rss"
    | "usage.summary"
    | "gmail.get_thread"
    | "github.get_file",
  errorCode: string | null = null,
  previewLength = 20
) {
  return {
    toolId,
    agentId,
    tenantId,
    correlationId: "audit-correlation",
    status,
    inputPreview: `{"text":"${"x".repeat(previewLength)} SECRET_BODY"}`,
    outputPreview:
      status === "COMPLETED"
        ? `{"text":"${"y".repeat(previewLength)} SECRET_BODY"}`
        : null,
    errorCode,
    durationMs: 12
  };
}
