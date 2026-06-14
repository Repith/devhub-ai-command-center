import type { TenantContext } from "@devhub/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  type AgentDefinitionRecord,
  type DatabaseClient,
  PrismaAgentDefinitionRepository,
  PrismaAgentRunRepository,
  PrismaGmailDraftReviewRepository
} from "../src";

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase("PrismaGmailDraftReviewRepository", () => {
  let agent: AgentDefinitionRecord;
  let context: TenantContext;
  let database: DatabaseClient;
  let foreignContext: TenantContext;
  let repository: PrismaGmailDraftReviewRepository;
  let runs: PrismaAgentRunRepository;

  beforeAll(async () => {
    database = createDatabaseClient(connectionString!);
    repository = new PrismaGmailDraftReviewRepository(database);
    runs = new PrismaAgentRunRepository(database);
    const agents = new PrismaAgentDefinitionRepository(database);

    context = await tenantContext(database, "gmail-review-test");
    foreignContext = await tenantContext(database, "gmail-review-foreign");
    agent = await agents.create(context, {
      name: "Gmail Reply Agent",
      provider: "ollama",
      model: "qwen3:8b",
      systemPrompt: "Draft replies.",
      maxSteps: 8,
      maxToolCalls: 4,
      timeoutMs: 120_000,
      enabledToolIds: [],
      knowledgeBaseIds: []
    });
  });

  afterAll(async () => {
    await database.tenant.deleteMany({
      where: { id: { in: [context.tenantId, foreignContext.tenantId] } }
    });
    await database.user.deleteMany({
      where: { id: { in: [context.userId, foreignContext.userId] } }
    });
    await database.$disconnect();
  });

  it("links draft reviews only to runs owned by the current tenant", async () => {
    const ownRun = await runs.createQueuedWithUserMessage(
      context,
      agent,
      runInput("Draft a safe reply.")
    );
    const foreignAgent = await new PrismaAgentDefinitionRepository(
      database
    ).create(foreignContext, {
      name: "Foreign Agent",
      provider: "ollama",
      model: "qwen3:8b",
      systemPrompt: "Foreign.",
      maxSteps: 8,
      maxToolCalls: 4,
      timeoutMs: 120_000,
      enabledToolIds: [],
      knowledgeBaseIds: []
    });
    const foreignRun = await runs.createQueuedWithUserMessage(
      foreignContext,
      foreignAgent,
      runInput("Foreign run.")
    );

    await expect(
      repository.create(context, {
        ...draftInput(),
        agentRunId: foreignRun.id
      })
    ).rejects.toThrow("Agent run was not found for this tenant.");

    const review = await repository.create(context, {
      ...draftInput(),
      agentRunId: ownRun.id
    });

    expect(review).toMatchObject({
      tenantId: context.tenantId,
      userId: context.userId,
      agentRunId: ownRun.id,
      status: "NEEDS_REVIEW"
    });
  });

  it("does not update sent or rejected draft reviews", async () => {
    const sent = await repository.createUserReview(context, draftInput());
    await repository.markSent(context, sent.id, {
      gmailDraftId: "sent-draft",
      threadId: "thread-1"
    });

    await expect(
      repository.update(context, sent.id, { body: "Changed after send." })
    ).resolves.toBeNull();

    const rejected = await repository.createUserReview(context, draftInput());
    await repository.reject(context, rejected.id);

    await expect(
      repository.update(context, rejected.id, { body: "Changed after reject." })
    ).resolves.toBeNull();
  });
});

async function tenantContext(
  database: DatabaseClient,
  slugPrefix: string
): Promise<TenantContext> {
  const user = await database.user.create({
    data: {
      email: `${slugPrefix}-${crypto.randomUUID()}@example.com`,
      passwordHash: "hash"
    }
  });
  const tenant = await database.tenant.create({
    data: { name: slugPrefix, slug: `${slugPrefix}-${crypto.randomUUID()}` }
  });
  return {
    tenantId: tenant.id,
    userId: user.id,
    correlationId: crypto.randomUUID()
  };
}

function runInput(message: string): {
  message: string;
  retrievalLimit: number;
} {
  return { message, retrievalLimit: 5 };
}

function draftInput(): {
  threadId: string;
  gmailDraftId: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
} {
  return {
    threadId: "thread-1",
    gmailDraftId: "draft-1",
    to: ["client@example.com"],
    cc: [],
    subject: "Re: Update",
    body: "Thanks for the note."
  };
}
