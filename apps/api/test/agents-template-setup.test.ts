import { afterEach, describe, expect, it } from "vitest";

import type {
  AgentDefinitionRecord,
  PrismaAgentDefinitionRepository
} from "@devhub/database";

import type { RequestPrincipal } from "../src/auth/auth.types";
import { AgentsService } from "../src/agents/agents.service";

const baseEnv = { ...process.env };

afterEach(() => {
  process.env = { ...baseEnv };
});

describe("AgentsService template setup state", () => {
  it("marks knowledge templates as needing setup until indexed documents exist", async () => {
    const pending = await service({
      indexedDocuments: 0
    }).listTemplates(principal());
    expect(
      setupStatus(pending.data, "knowledge-researcher", "knowledge.documents")
    ).toBe("NEEDS_SETUP");

    const ready = await service({
      indexedDocuments: 2
    }).listTemplates(principal());
    expect(
      setupStatus(ready.data, "knowledge-researcher", "knowledge.documents")
    ).toBe("READY");
  });

  it("marks Daily News Briefing readiness from enabled tenant feeds", async () => {
    const pending = await service({
      enabledNewsFeeds: 0
    }).listTemplates(principal());
    expect(
      setupStatus(pending.data, "daily-news-briefing", "tenant-news-feeds")
    ).toBe("NEEDS_SETUP");

    const ready = await service({
      enabledNewsFeeds: 1
    }).listTemplates(principal());
    expect(
      setupStatus(ready.data, "daily-news-briefing", "tenant-news-feeds")
    ).toBe("READY");
  });

  it("marks Gmail templates from per-user connection and server config", async () => {
    process.env.GMAIL_CLIENT_ID = "client-id";
    process.env.GMAIL_CLIENT_SECRET = "client-secret";
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "token-secret";

    const disconnected = await service({ gmailConnection: null }).listTemplates(
      principal()
    );
    expect(setupStatus(disconnected.data, "gmail-triage", "gmail.oauth")).toBe(
      "NEEDS_SETUP"
    );

    const connected = await service({
      gmailConnection: {
        encryptedRefreshToken: "encrypted-refresh",
        expiresAt: new Date(Date.now() + 3600_000),
        status: "CONNECTED"
      }
    }).listTemplates(principal());
    expect(setupStatus(connected.data, "gmail-triage", "gmail.oauth")).toBe(
      "READY"
    );
    expect(
      setupStatus(connected.data, "gmail-reply-assistant", "gmail.review")
    ).toBe("PLANNED");
  });

  it("marks connected Gmail templates as misconfigured when env is missing", async () => {
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;

    const templates = await service({
      gmailConnection: {
        encryptedRefreshToken: "encrypted-refresh",
        expiresAt: new Date(Date.now() + 3600_000),
        status: "CONNECTED"
      }
    }).listTemplates(principal());

    expect(setupStatus(templates.data, "gmail-triage", "gmail.oauth")).toBe(
      "MISCONFIGURED"
    );
  });

  it("adds dynamic setup state to installed template agents", async () => {
    const agents = await service({
      records: [agentRecord({ templateKey: "usage-analyst" })]
    }).list(principal());

    expect(agents[0]?.templateSetup).toEqual([
      { id: "usage.summary", label: "Usage summary API", status: "READY" }
    ]);
  });
});

function service(input: {
  enabledNewsFeeds?: number;
  gmailConnection?: {
    encryptedRefreshToken: string | null;
    expiresAt: Date | null;
    status: "CONNECTED" | "DISCONNECTED" | "EXPIRED";
  } | null;
  indexedDocuments?: number;
  records?: AgentDefinitionRecord[];
}): AgentsService {
  return new AgentsService(
    {
      list: () => Promise.resolve(input.records ?? [])
    } as Pick<PrismaAgentDefinitionRepository, "list"> as never,
    {
      document: {
        count: () => Promise.resolve(input.indexedDocuments ?? 0)
      },
      tenantNewsFeed: {
        count: () => Promise.resolve(input.enabledNewsFeeds ?? 0)
      },
      externalConnection: {
        findUnique: () => Promise.resolve(input.gmailConnection ?? null)
      }
    } as never,
    {
      record: () => Promise.resolve()
    } as never
  );
}

function setupStatus(
  templates: Awaited<ReturnType<AgentsService["listTemplates"]>>["data"],
  templateKey: string,
  setupId: string
): string | undefined {
  return templates
    .find((template) => template.key === templateKey)
    ?.requiredSetup.find((item) => item.id === setupId)?.status;
}

function principal(): RequestPrincipal {
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    sessionId: "session-test",
    role: "OWNER",
    email: "owner@example.com",
    displayName: "Owner",
    tenantName: "Tenant",
    tenantSlug: "tenant"
  };
}

function agentRecord(
  input: Partial<AgentDefinitionRecord> = {}
): AgentDefinitionRecord {
  const now = new Date();
  return {
    id: "00000000-0000-4000-8000-000000000101",
    tenantId: principal().tenantId,
    name: "Usage Analyst",
    description: null,
    provider: "ollama",
    model: "qwen3:8b",
    systemPrompt: "Analyze usage.",
    templateKey: null,
    maxSteps: 8,
    maxToolCalls: 4,
    maxTokens: null,
    timeoutMs: 120_000,
    enabledToolIds: ["usage.summary"],
    knowledgeBaseIds: [],
    workflowDefinition: null,
    workflowVersion: null,
    createdAt: now,
    updatedAt: now,
    ...input
  };
}
