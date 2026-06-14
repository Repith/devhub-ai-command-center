import type { CreateAgentRun } from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  type AgentDefinitionRecord,
  type DatabaseClient,
  PrismaAgentDefinitionRepository,
  PrismaAgentRunRepository,
  PrismaUsageRepository
} from "../src";

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase("PrismaAgentRunRepository", () => {
  let agent: AgentDefinitionRecord;
  let agents: PrismaAgentDefinitionRepository;
  let context: TenantContext;
  let database: DatabaseClient;
  let repository: PrismaAgentRunRepository;
  let usage: PrismaUsageRepository;

  beforeAll(async () => {
    database = createDatabaseClient(connectionString!);
    agents = new PrismaAgentDefinitionRepository(database);
    repository = new PrismaAgentRunRepository(database);
    usage = new PrismaUsageRepository(database);

    const tenant = await database.tenant.create({
      data: { name: "Run Test", slug: `run-test-${crypto.randomUUID()}` }
    });
    context = {
      tenantId: tenant.id,
      userId: crypto.randomUUID(),
      correlationId: crypto.randomUUID()
    };
    agent = await agents.create(context, {
      name: "Runtime Agent",
      provider: "ollama",
      model: "qwen3:8b",
      systemPrompt: "Answer through durable runs.",
      maxSteps: 8,
      maxToolCalls: 4,
      timeoutMs: 120_000,
      enabledToolIds: [],
      knowledgeBaseIds: []
    });
  });

  afterAll(async () => {
    await database.tenant.deleteMany({ where: { id: context.tenantId } });
    await database.$disconnect();
  });

  it("creates a new conversation, user message, and queued run together", async () => {
    const run = await repository.createQueuedWithUserMessage(
      context,
      agent,
      runInput("Start a durable conversation.")
    );

    expect(run.conversationId).toEqual(expect.any(String));
    expect(run.input).toMatchObject({ conversationId: run.conversationId });

    const messages = await database.message.findMany({
      where: {
        tenantId: context.tenantId,
        conversationId: run.conversationId!
      },
      orderBy: { sequence: "asc" }
    });
    expect(messages).toMatchObject([
      {
        role: "USER",
        content: "Start a durable conversation.",
        sequence: 1
      }
    ]);
  });

  it("continues an existing tenant-scoped conversation before queueing the run", async () => {
    const first = await repository.createQueuedWithUserMessage(
      context,
      agent,
      runInput("First message.")
    );
    const second = await repository.createQueuedWithUserMessage(
      context,
      agent,
      runInput("Second message.", first.conversationId!)
    );

    expect(second.conversationId).toBe(first.conversationId);
    expect(second.correlationId).not.toBe(first.correlationId);

    const messages = await database.message.findMany({
      where: {
        tenantId: context.tenantId,
        conversationId: first.conversationId!
      },
      orderBy: { sequence: "asc" }
    });
    expect(messages.map((message) => [message.role, message.content])).toEqual([
      ["USER", "First message."],
      ["USER", "Second message."]
    ]);
  });

  it("writes assistant message token fields and TokenUsage in the same completion transaction", async () => {
    const run = await repository.createQueuedWithUserMessage(
      context,
      agent,
      runInput("Persist the final answer.")
    );
    const step = await repository.startStep(
      context,
      run.id,
      1,
      "llm.generate",
      "Persist the final answer."
    );

    await repository.completeStep(context, step.id, {
      assistantMessage: {
        agentId: agent.id,
        content: "Durable answer.",
        conversationId: run.conversationId!
      },
      durationMs: 42,
      inputTokens: 11,
      model: agent.model,
      outputPreview: '{"content":"Durable answer."}',
      outputTokens: 7,
      provider: "ollama",
      retryCount: 1
    });

    const [assistant, tokenUsage] = await Promise.all([
      database.message.findFirst({
        where: {
          tenantId: context.tenantId,
          conversationId: run.conversationId!,
          role: "ASSISTANT"
        }
      }),
      database.tokenUsage.findFirst({
        where: { tenantId: context.tenantId, agentRunId: run.id }
      })
    ]);
    expect(assistant).toMatchObject({
      content: "Durable answer.",
      inputTokens: 11,
      outputTokens: 7,
      durationMs: 42
    });
    expect(tokenUsage).toMatchObject({
      inputTokens: 11,
      outputTokens: 7,
      latencyMs: 42,
      retryCount: 1
    });

    const summary = await usage.summarize(context, { period: "all" });
    expect(summary.runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          runId: run.id,
          inputTokens: 11,
          outputTokens: 7,
          totalTokens: 18
        })
      ])
    );
  });
});

function runInput(message: string, conversationId?: string): CreateAgentRun {
  return {
    message,
    ...(conversationId ? { conversationId } : {}),
    retrievalLimit: 5
  };
}
