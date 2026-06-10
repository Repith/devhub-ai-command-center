import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AccessTokenResponse,
  AgentDefinition,
  AuthenticatedUser,
  UsageSummary
} from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";

import { configureApp } from "../src/app-config";
import { AppModule } from "../src/app.module";
import { DATABASE_CLIENT } from "../src/database/database.module";

const alphaEmail = `usage-alpha-${crypto.randomUUID()}@example.com`;
const betaEmail = `usage-beta-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";

describe("usage summary", () => {
  let app: INestApplication | undefined;
  let database: DatabaseClient | undefined;
  let alphaToken: string;
  let betaToken: string;
  let alphaUser: AuthenticatedUser;
  let betaUser: AuthenticatedUser;
  let alphaAgent: AgentDefinition;
  let betaAgent: AgentDefinition;
  let alphaRunId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-secret-with-at-least-32-characters";
    process.env.JWT_ISSUER = "devhub-ai-command-center";
    process.env.JWT_AUDIENCE = "devhub-api";
    process.env.REFRESH_COOKIE_SECURE = "false";

    const module = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    database = app.get<DatabaseClient>(DATABASE_CLIENT);

    const [alphaRegistration, betaRegistration] = await Promise.all([
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: alphaEmail,
        password,
        tenantName: "Usage Alpha Workspace"
      }),
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: betaEmail,
        password,
        tenantName: "Usage Beta Workspace"
      })
    ]);
    alphaToken = (alphaRegistration.body as AccessTokenResponse).accessToken;
    betaToken = (betaRegistration.body as AccessTokenResponse).accessToken;

    const [alphaMe, betaMe] = await Promise.all([
      request(app.getHttpServer())
        .get("/api/v1/me")
        .set("Authorization", `Bearer ${alphaToken}`)
        .expect(200),
      request(app.getHttpServer())
        .get("/api/v1/me")
        .set("Authorization", `Bearer ${betaToken}`)
        .expect(200)
    ]);
    alphaUser = alphaMe.body as AuthenticatedUser;
    betaUser = betaMe.body as AuthenticatedUser;

    alphaAgent = await createAgent(alphaToken, "Usage Alpha Agent");
    betaAgent = await createAgent(betaToken, "Usage Beta Agent");
    alphaRunId = await seedUsage(
      alphaUser.tenantId,
      alphaAgent.id,
      12,
      8,
      42,
      2
    );
    await seedUsage(betaUser.tenantId, betaAgent.id, 100, 50, 999, 0);
  });

  afterAll(async () => {
    if (database) {
      await database.user.deleteMany({
        where: { email: { in: [alphaEmail, betaEmail] } }
      });
    }
    await app?.close();
  });

  it("returns tenant-scoped usage totals grouped by agent and run", async () => {
    const response = await request(app!.getHttpServer())
      .get("/api/v1/usage")
      .set("Authorization", `Bearer ${alphaToken}`)
      .expect(200);
    const summary = response.body as UsageSummary;

    expect(summary.tenant).toMatchObject({
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      costMicros: 0,
      latencyMs: 42,
      retryCount: 2
    });
    expect(summary.agents).toEqual([
      expect.objectContaining({ agentId: alphaAgent.id, totalTokens: 20 })
    ]);
    expect(summary.runs).toEqual([
      expect.objectContaining({ runId: alphaRunId, totalTokens: 20 })
    ]);
    expect(JSON.stringify(summary)).not.toContain(betaAgent.id);
    expect(JSON.stringify(summary)).not.toContain(betaUser.tenantId);
  });

  async function createAgent(
    accessToken: string,
    name: string
  ): Promise<AgentDefinition> {
    const response = await request(app!.getHttpServer())
      .post("/api/v1/agents")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name,
        provider: "ollama",
        model: "qwen3:8b",
        systemPrompt: "Track usage.",
        enabledToolIds: [],
        knowledgeBaseIds: []
      })
      .expect(201);
    return response.body as AgentDefinition;
  }

  async function seedUsage(
    tenantId: string,
    agentId: string,
    inputTokens: number,
    outputTokens: number,
    latencyMs: number,
    retryCount: number
  ): Promise<string> {
    const run = await database!.agentRun.create({
      data: {
        tenantId,
        agentId,
        input: { message: "Measure this.", retrievalLimit: 5 },
        configSnapshot: {
          agentId,
          provider: "ollama",
          model: "qwen3:8b",
          systemPrompt: "Track usage.",
          maxSteps: 8,
          maxToolCalls: 4,
          maxTokens: null,
          timeoutMs: 120_000,
          enabledToolIds: [],
          knowledgeBaseIds: []
        },
        correlationId: crypto.randomUUID()
      }
    });
    await database!.tokenUsage.create({
      data: {
        tenantId,
        agentRunId: run.id,
        provider: "ollama",
        model: "qwen3:8b",
        inputTokens,
        outputTokens,
        latencyMs,
        retryCount
      }
    });
    return run.id;
  }
});
