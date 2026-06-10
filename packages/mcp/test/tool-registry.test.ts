import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { McpToolAuditEntry } from "@devhub/contracts";

import { StaticToolRegistry, ToolRegistryError } from "../src";

const context = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  correlationId: "test-correlation"
};

describe("StaticToolRegistry", () => {
  it("denies calls for tools that are not enabled for the agent", async () => {
    const audit: McpToolAuditEntry[] = [];
    const registry = new StaticToolRegistry(
      [
        {
          id: "news.fetch_rss",
          description: "Fetch RSS",
          inputSchema: z.object({ url: z.string(), limit: z.number() }),
          outputSchema: z.object({ ok: z.boolean() }),
          execute: () => Promise.resolve({ ok: true })
        }
      ],
      {
        record: (entry) => {
          audit.push(entry);
          return Promise.resolve();
        }
      }
    );

    await expect(
      registry.call({
        agent: { id: crypto.randomUUID(), enabledToolIds: [] },
        context,
        toolId: "news.fetch_rss",
        input: { url: "https://example.com/rss.xml", limit: 1 }
      })
    ).rejects.toBeInstanceOf(ToolRegistryError);

    expect(audit).toMatchObject([
      {
        toolId: "news.fetch_rss",
        tenantId: context.tenantId,
        status: "DENIED",
        errorCode: "TOOL_NOT_ALLOWED"
      }
    ]);
  });

  it("validates input and records bounded output previews", async () => {
    const audit: McpToolAuditEntry[] = [];
    const registry = new StaticToolRegistry(
      [
        {
          id: "news.fetch_rss",
          description: "Fetch RSS",
          inputSchema: z.object({ url: z.string(), limit: z.number() }),
          outputSchema: z.object({ text: z.string() }),
          execute: () => Promise.resolve({ text: "x".repeat(3000) })
        }
      ],
      {
        record: (entry) => {
          audit.push(entry);
          return Promise.resolve();
        }
      }
    );

    const result = await registry.call<{ text: string }>({
      agent: {
        id: crypto.randomUUID(),
        enabledToolIds: ["news.fetch_rss"]
      },
      context,
      toolId: "news.fetch_rss",
      input: { url: "https://example.com/rss.xml", limit: 1 }
    });

    expect(result.output.text).toHaveLength(3000);
    expect(result.outputPreview.length).toBeLessThanOrEqual(2003);
    expect(audit[0]).toMatchObject({
      status: "COMPLETED",
      errorCode: null
    });
  });
});
