import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FakeLlmProvider } from "@devhub/ai";
import type {
  AccessTokenResponse,
  AgentDefinition,
  ChatStreamEvent,
  ConversationMessageList
} from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";

import { configureApp } from "../src/app-config";
import { AppModule } from "../src/app.module";
import { LLM_PROVIDER } from "../src/chat/chat.tokens";
import { DATABASE_CLIENT } from "../src/database/database.module";

const ownerEmail = `chat-owner-${crypto.randomUUID()}@example.com`;
const outsiderEmail = `chat-outsider-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";
const describeWithDatabase = process.env.DATABASE_URL
  ? describe
  : describe.skip;

describeWithDatabase("Ollama chat foundation", () => {
  let app: INestApplication | undefined;
  let database: DatabaseClient | undefined;
  let ownerToken: string;
  let outsiderToken: string;
  let agent: AgentDefinition;
  const provider = new FakeLlmProvider({
    chunks: ["Hello", " from the fake model."],
    usage: { inputTokens: 21, outputTokens: 6 }
  });

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-secret-with-at-least-32-characters";
    process.env.JWT_ISSUER = "devhub-ai-command-center";
    process.env.JWT_AUDIENCE = "devhub-api";
    process.env.REFRESH_COOKIE_SECURE = "false";

    const module = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(LLM_PROVIDER)
      .useValue(provider)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    database = app.get<DatabaseClient>(DATABASE_CLIENT);

    const [ownerRegistration, outsiderRegistration] = await Promise.all([
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: ownerEmail,
        password,
        tenantName: "Chat Owner Workspace"
      }),
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: outsiderEmail,
        password,
        tenantName: "Chat Outsider Workspace"
      })
    ]);
    ownerToken = (ownerRegistration.body as AccessTokenResponse).accessToken;
    outsiderToken = (outsiderRegistration.body as AccessTokenResponse)
      .accessToken;

    const agentResponse = await request(app.getHttpServer())
      .post("/api/v1/agents")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Chat Assistant",
        provider: "ollama",
        model: "qwen3:8b",
        systemPrompt: "Answer concisely.",
        maxSteps: 4,
        maxToolCalls: 0,
        maxTokens: 128,
        timeoutMs: 5_000,
        enabledToolIds: [],
        knowledgeBaseIds: []
      })
      .expect(201);
    agent = agentResponse.body as AgentDefinition;
  });

  afterAll(async () => {
    if (database) {
      await database.user.deleteMany({
        where: { email: { in: [ownerEmail, outsiderEmail] } }
      });
    }
    await app?.close();
  });

  it("streams and persists a conversation with preliminary usage", async () => {
    const chatResponse = await request(app!.getHttpServer())
      .post(`/api/v1/agents/${agent.id}/chat`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ message: "Say hello." })
      .expect(200)
      .expect("Content-Type", /application\/x-ndjson/);
    const events = parseEvents(chatResponse.text);

    expect(events.map((event) => event.type)).toEqual([
      "chat.started",
      "chat.delta",
      "chat.delta",
      "chat.completed"
    ]);
    const started = events[0];
    expect(started?.type).toBe("chat.started");
    expect(events.at(-1)).toMatchObject({
      type: "chat.completed",
      usage: {
        provider: "fake",
        model: "qwen3:8b",
        inputTokens: 21,
        outputTokens: 6
      },
      assistantMessage: {
        content: "Hello from the fake model.",
        sequence: 2
      }
    });
    if (started?.type !== "chat.started") {
      throw new Error("Missing chat.started event.");
    }

    const messagesResponse = await request(app!.getHttpServer())
      .get(`/api/v1/conversations/${started.conversationId}/messages`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const messages = messagesResponse.body as ConversationMessageList;
    expect(messages.data).toHaveLength(2);
    expect(messages.data[1]).toMatchObject({
      role: "ASSISTANT",
      provider: "fake",
      model: "qwen3:8b",
      inputTokens: 21,
      outputTokens: 6
    });

    await request(app!.getHttpServer())
      .get(`/api/v1/conversations/${started.conversationId}`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .expect(404);

    const continuation = await request(app!.getHttpServer())
      .post(`/api/v1/agents/${agent.id}/chat`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        conversationId: started.conversationId,
        message: "Continue."
      })
      .expect(200);
    expect(parseEvents(continuation.text).at(-1)).toMatchObject({
      type: "chat.completed",
      assistantMessage: { sequence: 4 }
    });
    expect(
      provider.requests.at(-1)?.messages.map((message) => message.role)
    ).toEqual(["system", "user", "assistant", "user"]);
  });

  it("rejects client-provided tenant context", async () => {
    await request(app!.getHttpServer())
      .post(`/api/v1/agents/${agent.id}/chat`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        message: "Unsafe request",
        tenantId: crypto.randomUUID()
      })
      .expect(400);
  });
});

function parseEvents(body: string): ChatStreamEvent[] {
  return body
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ChatStreamEvent);
}
