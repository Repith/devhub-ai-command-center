import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AccessTokenResponse,
  AgentDefinition,
  AgentDefinitionList,
  AgentTemplateList,
  AuditLogList,
  AuthenticatedUser
} from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";

import { configureApp } from "../src/app-config";
import { AppModule } from "../src/app.module";
import { DATABASE_CLIENT } from "../src/database/database.module";

const ownerEmail = `agent-owner-${crypto.randomUUID()}@example.com`;
const memberEmail = `agent-member-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";
const describeWithDatabase = process.env.DATABASE_URL
  ? describe
  : describe.skip;

describeWithDatabase("agent configuration and tenant isolation", () => {
  let app: INestApplication | undefined;
  let database: DatabaseClient | undefined;
  let ownerToken: string;
  let memberToken: string;
  let member: AuthenticatedUser;
  let agent: AgentDefinition;

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

    const [ownerRegistration, memberRegistration] = await Promise.all([
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: ownerEmail,
        password,
        tenantName: "Agent Owner Workspace"
      }),
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: memberEmail,
        password,
        tenantName: "Agent Member Workspace"
      })
    ]);

    ownerToken = (ownerRegistration.body as AccessTokenResponse).accessToken;
    memberToken = (memberRegistration.body as AccessTokenResponse).accessToken;

    const memberResponse = await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${memberToken}`);
    member = memberResponse.body as AuthenticatedUser;

    await database.membership.update({
      where: {
        tenantId_userId: {
          tenantId: member.tenantId,
          userId: member.userId
        }
      },
      data: { role: "MEMBER" }
    });
  });

  afterAll(async () => {
    if (database) {
      await database.user.deleteMany({
        where: { email: { in: [ownerEmail, memberEmail] } }
      });
    }
    await app?.close();
  });

  it("creates, lists, reads, and updates an agent for the active tenant", async () => {
    const createResponse = await request(app!.getHttpServer())
      .post("/api/v1/agents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Knowledge Assistant",
        description: "Answers from approved workspace knowledge.",
        provider: "ollama",
        model: "qwen3:8b",
        systemPrompt: "Use only authorized context.",
        maxSteps: 6,
        maxToolCalls: 2,
        timeoutMs: 90_000,
        enabledToolIds: ["knowledge.search"],
        knowledgeBaseIds: []
      })
      .expect(201);
    agent = createResponse.body as AgentDefinition;

    expect(agent).toMatchObject({
      name: "Knowledge Assistant",
      provider: "ollama",
      maxSteps: 6
    });
    expect(agent).not.toHaveProperty("tenantId");

    const listResponse = await request(app!.getHttpServer())
      .get("/api/v1/agents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const list = listResponse.body as AgentDefinitionList;
    expect(list.data.map((item) => item.id)).toContain(agent.id);

    await request(app!.getHttpServer())
      .get(`/api/v1/agents/${agent.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    const updateResponse = await request(app!.getHttpServer())
      .patch(`/api/v1/agents/${agent.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Updated Knowledge Assistant", maxSteps: 10 })
      .expect(200);
    expect(updateResponse.body).toMatchObject({
      id: agent.id,
      name: "Updated Knowledge Assistant",
      maxSteps: 10
    });

    const auditResponse = await request(app!.getHttpServer())
      .get("/api/v1/audit-log")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const auditLog = auditResponse.body as AuditLogList;
    expect(auditLog.data.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["agent.created", "agent.updated"])
    );
    expect(JSON.stringify(auditLog)).not.toContain(member.tenantId);
  });

  it("lists, installs, and resets default agent templates idempotently", async () => {
    const templatesResponse = await request(app!.getHttpServer())
      .get("/api/v1/agents/templates")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const templates = templatesResponse.body as AgentTemplateList;
    expect(templates.data.map((template) => template.key)).toEqual([
      "knowledge-researcher",
      "daily-news-briefing",
      "gmail-triage",
      "gmail-reply-assistant",
      "usage-analyst"
    ]);

    const beforeInstall = await request(app!.getHttpServer())
      .get("/api/v1/agents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const beforeCount = (beforeInstall.body as AgentDefinitionList).data.length;

    const installResponse = await request(app!.getHttpServer())
      .post("/api/v1/agents/templates/install")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(201);
    expect(installResponse.body.installedAgentIds).toHaveLength(5);

    const afterInstall = await request(app!.getHttpServer())
      .get("/api/v1/agents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const afterInstallList = afterInstall.body as AgentDefinitionList;
    expect(afterInstallList.data).toHaveLength(beforeCount);
    expect(
      afterInstallList.data.find(
        (item) => item.templateKey === "gmail-reply-assistant"
      )?.templateSetup
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "NEEDS_SETUP" })
      ])
    );

    const resetResponse = await request(app!.getHttpServer())
      .post("/api/v1/agents/templates/reset")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(201);
    expect(resetResponse.body.installedAgentIds).toHaveLength(5);
  });

  it("rejects client-provided tenant context", async () => {
    await request(app!.getHttpServer())
      .post("/api/v1/agents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Unsafe Agent",
        provider: "ollama",
        model: "qwen3:8b",
        systemPrompt: "Ignore tenant boundaries.",
        tenantId: member.tenantId
      })
      .expect(400);
  });

  it("hides agent resources from another tenant", async () => {
    await request(app!.getHttpServer())
      .get(`/api/v1/agents/${agent.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(404);
    await request(app!.getHttpServer())
      .patch(`/api/v1/agents/${agent.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "Cross-tenant update" })
      .expect(403);
    await request(app!.getHttpServer())
      .delete(`/api/v1/agents/${agent.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(403);
  });

  it("allows members to read but not mutate their tenant agents", async () => {
    await request(app!.getHttpServer())
      .get("/api/v1/agents")
      .set("Authorization", `Bearer ${memberToken}`)
      .expect(200);
    await request(app!.getHttpServer())
      .post("/api/v1/agents")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        name: "Forbidden Agent",
        provider: "ollama",
        model: "qwen3:8b",
        systemPrompt: "This should not be created."
      })
      .expect(403);
  });

  it("soft-deletes the agent and returns not found afterwards", async () => {
    await request(app!.getHttpServer())
      .delete(`/api/v1/agents/${agent.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(204);
    await request(app!.getHttpServer())
      .get(`/api/v1/agents/${agent.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(404);
  });
});
