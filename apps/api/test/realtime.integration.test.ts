import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AccessTokenResponse,
  AgentDefinition,
  AuthenticatedUser,
  RealtimeProbeAck,
  SubscribeToRunAck
} from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";

import { configureApp } from "../src/app-config";
import { AppModule } from "../src/app.module";
import { DATABASE_CLIENT } from "../src/database/database.module";

const email = `realtime-${crypto.randomUUID()}@example.com`;
const foreignEmail = `realtime-foreign-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";

describe("authenticated realtime gateway", () => {
  let app: INestApplication | undefined;
  let database: DatabaseClient | undefined;
  let origin: string;
  let accessToken: string;
  let foreignAccessToken: string;
  let user: AuthenticatedUser;
  let agent: AgentDefinition;
  let runId: string;
  const sockets: Socket[] = [];

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
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
    database = app.get<DatabaseClient>(DATABASE_CLIENT);

    const [registration, foreignRegistration] = await Promise.all([
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email,
        password,
        tenantName: "Realtime Workspace"
      }),
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: foreignEmail,
        password,
        tenantName: "Foreign Realtime Workspace"
      })
    ]);
    accessToken = (registration.body as AccessTokenResponse).accessToken;
    foreignAccessToken = (foreignRegistration.body as AccessTokenResponse)
      .accessToken;

    const meResponse = await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    user = meResponse.body as AuthenticatedUser;

    const createAgentResponse = await request(app.getHttpServer())
      .post("/api/v1/agents")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Realtime Agent",
        provider: "ollama",
        model: "qwen3:8b",
        systemPrompt: "Report timeline events.",
        enabledToolIds: [],
        knowledgeBaseIds: []
      })
      .expect(201);
    agent = createAgentResponse.body as AgentDefinition;
    const run = await database!.agentRun.create({
      data: {
        tenantId: user.tenantId,
        agentId: agent.id,
        input: { message: "Watch me.", retrievalLimit: 5 },
        configSnapshot: {
          agentId: agent.id,
          provider: agent.provider,
          model: agent.model,
          systemPrompt: agent.systemPrompt,
          maxSteps: agent.maxSteps,
          maxToolCalls: agent.maxToolCalls,
          maxTokens: agent.maxTokens,
          timeoutMs: agent.timeoutMs,
          enabledToolIds: [...agent.enabledToolIds],
          knowledgeBaseIds: [...agent.knowledgeBaseIds]
        },
        correlationId: crypto.randomUUID()
      }
    });
    runId = run.id;
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    if (database) {
      await database.user.deleteMany({
        where: { email: { in: [email, foreignEmail] } }
      });
    }
    await app?.close();
  });

  it("authenticates and acknowledges a tenant-safe probe", async () => {
    const socket = connect({ token: accessToken });
    await connected(socket);
    const requestId = crypto.randomUUID();
    const ack = await new Promise<RealtimeProbeAck>((resolve, reject) => {
      socket.timeout(5_000).emit(
        "realtime.probe",
        {
          version: 1,
          requestId,
          sentAt: new Date().toISOString()
        },
        (error: Error | null, response: RealtimeProbeAck) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        }
      );
    });

    expect(ack).toMatchObject({
      ok: true,
      event: {
        version: 1,
        type: "realtime.probe_ack",
        requestId
      }
    });
    expect(JSON.stringify(ack)).not.toContain("tenantId");
  });

  it("rejects a websocket handshake without an access token", async () => {
    const socket = connect({});
    const message = await new Promise<string>((resolve) => {
      socket.once("connect_error", (error) => resolve(error.message));
    });
    expect(message).toBe("Authentication required.");
  });

  it("authorizes run room subscriptions with the active tenant", async () => {
    const socket = connect({ token: accessToken });
    await connected(socket);
    const ack = await subscribeToRun(socket, runId);

    expect(ack).toMatchObject({
      ok: true,
      snapshot: {
        run: {
          id: runId,
          agentId: agent.id
        },
        steps: []
      }
    });
  });

  it("rejects subscriptions to another tenant run", async () => {
    const socket = connect({ token: foreignAccessToken });
    await connected(socket);
    const ack = await subscribeToRun(socket, runId);

    expect(ack).toMatchObject({
      ok: false,
      error: { code: "RUN_NOT_FOUND" }
    });
  });

  function connect(auth: Record<string, string>): Socket {
    const socket = io(`${origin}/realtime`, {
      auth,
      transports: ["websocket"],
      reconnection: false,
      timeout: 5_000
    });
    sockets.push(socket);
    return socket;
  }
});

function subscribeToRun(
  socket: Socket,
  runId: string
): Promise<SubscribeToRunAck> {
  return new Promise((resolve, reject) => {
    socket.timeout(5_000).emit(
      "subscribe_to_run",
      {
        version: 1,
        runId
      },
      (error: Error | null, response: SubscribeToRunAck) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      }
    );
  });
}

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
}
