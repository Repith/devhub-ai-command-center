import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AccessTokenResponse,
  AgentDefinition,
  AgentRun,
  AgentRunJob,
  AgentRunSnapshot
} from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";

import { AGENT_RUN_QUEUE } from "../src/runs/runs.tokens";
import { configureApp } from "../src/app-config";
import { AppModule } from "../src/app.module";
import { DATABASE_CLIENT } from "../src/database/database.module";

const alphaEmail = `run-alpha-${crypto.randomUUID()}@example.com`;
const betaEmail = `run-beta-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";

describe("agent runs", () => {
  let app: INestApplication | undefined;
  let database: DatabaseClient | undefined;
  let alphaToken: string;
  let betaToken: string;
  let agent: AgentDefinition;
  const jobs: AgentRunJob[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-secret-with-at-least-32-characters";
    process.env.JWT_ISSUER = "devhub-ai-command-center";
    process.env.JWT_AUDIENCE = "devhub-api";
    process.env.REFRESH_COOKIE_SECURE = "false";

    const module = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(AGENT_RUN_QUEUE)
      .useValue({
        enqueue: (input: AgentRunJob) => {
          jobs.push(input);
          return Promise.resolve();
        }
      })
      .compile();

    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    database = app.get<DatabaseClient>(DATABASE_CLIENT);

    const [alphaRegistration, betaRegistration] = await Promise.all([
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: alphaEmail,
        password,
        tenantName: "Run Alpha Workspace"
      }),
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: betaEmail,
        password,
        tenantName: "Run Beta Workspace"
      })
    ]);
    alphaToken = (alphaRegistration.body as AccessTokenResponse).accessToken;
    betaToken = (betaRegistration.body as AccessTokenResponse).accessToken;

    const createAgent = await request(app.getHttpServer())
      .post("/api/v1/agents")
      .set("Authorization", `Bearer ${alphaToken}`)
      .send({
        name: "Runtime Agent",
        provider: "ollama",
        model: "qwen3:8b",
        systemPrompt: "Use allowed tools only.",
        enabledToolIds: ["knowledge.search", "news.fetch_rss"],
        knowledgeBaseIds: []
      })
      .expect(201);
    agent = createAgent.body as AgentDefinition;
  });

  afterAll(async () => {
    if (database) {
      await database.user.deleteMany({
        where: { email: { in: [alphaEmail, betaEmail] } }
      });
    }
    await app?.close();
  });

  it("starts a tenant-scoped durable run and enqueues the worker job", async () => {
    const response = await request(app!.getHttpServer())
      .post(`/api/v1/agents/${agent.id}/runs`)
      .set("Authorization", `Bearer ${alphaToken}`)
      .send({
        message: "Use the feed and knowledge.",
        retrievalLimit: 3,
        rssUrl: "https://example.com/feed.xml"
      })
      .expect(201);
    const run = response.body as AgentRun;

    expect(run).toMatchObject({
      agentId: agent.id,
      status: "QUEUED",
      input: {
        message: "Use the feed and knowledge.",
        conversationId: run.conversationId,
        retrievalLimit: 3,
        rssUrl: "https://example.com/feed.xml"
      }
    });
    expect(run.conversationId).toEqual(expect.any(String));
    expect(run).not.toHaveProperty("tenantId");
    expect(jobs.at(-1)).toMatchObject({ runId: run.id });

    const messages = await database!.message.findMany({
      where: {
        conversationId: run.conversationId!,
        tenantId: jobs.at(-1)!.tenantId
      },
      orderBy: { sequence: "asc" }
    });
    expect(messages).toMatchObject([
      {
        role: "USER",
        content: "Use the feed and knowledge.",
        sequence: 1
      }
    ]);

    const snapshotResponse = await request(app!.getHttpServer())
      .get(`/api/v1/runs/${run.id}`)
      .set("Authorization", `Bearer ${alphaToken}`)
      .expect(200);
    const snapshot = snapshotResponse.body as AgentRunSnapshot;
    expect(snapshot.run.id).toBe(run.id);
    expect(snapshot.steps).toEqual([]);

    await request(app!.getHttpServer())
      .get(`/api/v1/runs/${run.id}`)
      .set("Authorization", `Bearer ${betaToken}`)
      .expect(404);
  });

  it("continues an existing conversation when creating a durable run", async () => {
    const first = await request(app!.getHttpServer())
      .post(`/api/v1/agents/${agent.id}/runs`)
      .set("Authorization", `Bearer ${alphaToken}`)
      .send({ message: "First durable message." })
      .expect(201);
    const firstRun = first.body as AgentRun;

    const second = await request(app!.getHttpServer())
      .post(`/api/v1/agents/${agent.id}/runs`)
      .set("Authorization", `Bearer ${alphaToken}`)
      .send({
        conversationId: firstRun.conversationId,
        message: "Second durable message."
      })
      .expect(201);
    const secondRun = second.body as AgentRun;

    expect(secondRun.conversationId).toBe(firstRun.conversationId);

    const messages = await database!.message.findMany({
      where: {
        conversationId: firstRun.conversationId!,
        tenantId: jobs.at(-1)!.tenantId
      },
      orderBy: { sequence: "asc" }
    });
    expect(messages.map((message) => [message.role, message.content])).toEqual([
      ["USER", "First durable message."],
      ["USER", "Second durable message."]
    ]);
  });

  it("rejects client-provided tenant context", async () => {
    await request(app!.getHttpServer())
      .post(`/api/v1/agents/${agent.id}/runs`)
      .set("Authorization", `Bearer ${alphaToken}`)
      .send({
        message: "Unsafe run.",
        tenantId: crypto.randomUUID()
      })
      .expect(400);
  });
});
