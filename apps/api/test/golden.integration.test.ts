import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AccessTokenResponse,
  AgentDefinition,
  EvaluationReport,
  EvaluationRun,
  GoldenCase,
  GoldenEvaluationJob
} from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";

import { configureApp } from "../src/app-config";
import { AppModule } from "../src/app.module";
import { DATABASE_CLIENT } from "../src/database/database.module";
import { GOLDEN_EVALUATION_QUEUE } from "../src/golden/golden.tokens";

const alphaEmail = `golden-alpha-${crypto.randomUUID()}@example.com`;
const betaEmail = `golden-beta-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";

describe("golden set evaluation", () => {
  let app: INestApplication | undefined;
  let database: DatabaseClient | undefined;
  let alphaToken: string;
  let betaToken: string;
  let alphaAgent: AgentDefinition;
  let betaAgent: AgentDefinition;
  const jobs: GoldenEvaluationJob[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-secret-with-at-least-32-characters";
    process.env.JWT_ISSUER = "devhub-ai-command-center";
    process.env.JWT_AUDIENCE = "devhub-api";
    process.env.REFRESH_COOKIE_SECURE = "false";

    const module = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(GOLDEN_EVALUATION_QUEUE)
      .useValue({
        enqueue: (input: GoldenEvaluationJob) => {
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
        tenantName: "Golden Alpha Workspace"
      }),
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: betaEmail,
        password,
        tenantName: "Golden Beta Workspace"
      })
    ]);
    alphaToken = (alphaRegistration.body as AccessTokenResponse).accessToken;
    betaToken = (betaRegistration.body as AccessTokenResponse).accessToken;
    alphaAgent = await createAgent(alphaToken, "Alpha Golden Agent");
    betaAgent = await createAgent(betaToken, "Beta Golden Agent");
  });

  afterAll(async () => {
    if (database) {
      await database.user.deleteMany({
        where: { email: { in: [alphaEmail, betaEmail] } }
      });
    }
    await app?.close();
  });

  it("manages tenant-scoped golden cases and enqueues an evaluation run", async () => {
    const created = await request(app!.getHttpServer())
      .post("/api/v1/golden-cases")
      .set("Authorization", `Bearer ${alphaToken}`)
      .send({
        agentId: alphaAgent.id,
        name: "Alpha source case",
        input: "Answer with the alpha handbook source.",
        expectedFacts: ["alpha handbook"],
        forbiddenClaims: ["beta handbook"],
        expectedSources: ["alpha-handbook.md"]
      })
      .expect(201);
    const goldenCase = created.body as GoldenCase;

    expect(goldenCase).toMatchObject({
      agentId: alphaAgent.id,
      name: "Alpha source case",
      expectedSources: ["alpha-handbook.md"]
    });
    expect(goldenCase).not.toHaveProperty("tenantId");

    await request(app!.getHttpServer())
      .get(`/api/v1/golden-cases/${goldenCase.id}`)
      .set("Authorization", `Bearer ${betaToken}`)
      .expect(404);

    const update = await request(app!.getHttpServer())
      .patch(`/api/v1/golden-cases/${goldenCase.id}`)
      .set("Authorization", `Bearer ${alphaToken}`)
      .send({ expectedFacts: ["alpha handbook", "tenant safe"] })
      .expect(200);
    expect((update.body as GoldenCase).expectedFacts).toEqual([
      "alpha handbook",
      "tenant safe"
    ]);

    const evaluation = await request(app!.getHttpServer())
      .post("/api/v1/evaluations/golden-set")
      .set("Authorization", `Bearer ${alphaToken}`)
      .send({})
      .expect(201);
    const evaluationRun = evaluation.body as EvaluationRun;

    expect(evaluationRun).toMatchObject({
      mode: "FAST_LLM_ONLY",
      status: "QUEUED"
    });
    expect(evaluationRun.configVersion).toContain(
      "golden-set:v1:FAST_LLM_ONLY"
    );
    expect(jobs.at(-1)).toMatchObject({
      evaluationRunId: evaluationRun.id,
      mode: "FAST_LLM_ONLY"
    });

    const runtimeEvaluation = await request(app!.getHttpServer())
      .post("/api/v1/evaluations/golden-set")
      .set("Authorization", `Bearer ${alphaToken}`)
      .send({ mode: "FULL_AGENT_RUNTIME" })
      .expect(201);
    const runtimeRun = runtimeEvaluation.body as EvaluationRun;
    expect(runtimeRun).toMatchObject({
      mode: "FULL_AGENT_RUNTIME",
      status: "QUEUED"
    });
    expect(runtimeRun.configVersion).toContain(
      "golden-set:v1:FULL_AGENT_RUNTIME"
    );
    expect(jobs.at(-1)).toMatchObject({
      evaluationRunId: runtimeRun.id,
      mode: "FULL_AGENT_RUNTIME"
    });

    const report = await request(app!.getHttpServer())
      .get(`/api/v1/evaluations/${evaluationRun.id}`)
      .set("Authorization", `Bearer ${alphaToken}`)
      .expect(200);
    expect((report.body as EvaluationReport).run.id).toBe(evaluationRun.id);

    await request(app!.getHttpServer())
      .get(`/api/v1/evaluations/${evaluationRun.id}`)
      .set("Authorization", `Bearer ${betaToken}`)
      .expect(404);
  });

  it("rejects golden cases for another tenant agent", async () => {
    await request(app!.getHttpServer())
      .post("/api/v1/golden-cases")
      .set("Authorization", `Bearer ${alphaToken}`)
      .send({
        agentId: betaAgent.id,
        name: "Unsafe foreign agent case",
        input: "Use another tenant agent.",
        expectedFacts: [],
        forbiddenClaims: [],
        expectedSources: []
      })
      .expect(404);
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
        systemPrompt: "Evaluate carefully.",
        enabledToolIds: [],
        knowledgeBaseIds: []
      })
      .expect(201);
    return response.body as AgentDefinition;
  }
});
