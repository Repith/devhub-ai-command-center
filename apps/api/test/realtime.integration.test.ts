import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AccessTokenResponse, RealtimeProbeAck } from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";

import { configureApp } from "../src/app-config";
import { AppModule } from "../src/app.module";
import { DATABASE_CLIENT } from "../src/database/database.module";

const email = `realtime-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";

describe("authenticated realtime gateway", () => {
  let app: INestApplication | undefined;
  let database: DatabaseClient | undefined;
  let origin: string;
  let accessToken: string;
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

    const registration = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email,
        password,
        tenantName: "Realtime Workspace"
      })
      .expect(201);
    accessToken = (registration.body as AccessTokenResponse).accessToken;
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    if (database) {
      await database.user.deleteMany({ where: { email } });
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

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
}
