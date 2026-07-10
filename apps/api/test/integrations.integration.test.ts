import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AccessTokenResponse,
  AuthenticatedUser,
  IntegrationsStatusResponse
} from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";

import { configureApp } from "../src/app-config";
import { AppModule } from "../src/app.module";
import { DATABASE_CLIENT } from "../src/database/database.module";
import { BullMqDocumentIngestionQueue } from "../src/documents/document-queue.service";
import { BullMqGoldenEvaluationQueue } from "../src/golden/golden-queue.service";
import { BullMqAgentRunQueue } from "../src/runs/agent-run-queue.service";

const ownerEmail = `integrations-owner-${crypto.randomUUID()}@example.com`;
const foreignEmail = `integrations-foreign-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";
const describeWithDatabase = process.env.DATABASE_URL
  ? describe
  : describe.skip;

describeWithDatabase("integration status API", () => {
  let app: INestApplication | undefined;
  let database: DatabaseClient | undefined;
  let ownerToken: string;
  let owner: AuthenticatedUser;
  let foreign: AuthenticatedUser;

  beforeAll(async () => {
    configureOAuthEnvironment();
    process.env.JWT_SECRET = "integration-secret-with-at-least-32-characters";
    process.env.JWT_ISSUER = "devhub-ai-command-center";
    process.env.JWT_AUDIENCE = "devhub-api";
    process.env.REFRESH_COOKIE_SECURE = "false";

    const module = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(BullMqAgentRunQueue)
      .useValue(noopQueue())
      .overrideProvider(BullMqDocumentIngestionQueue)
      .useValue(noopQueue())
      .overrideProvider(BullMqGoldenEvaluationQueue)
      .useValue(noopQueue())
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    database = app.get<DatabaseClient>(DATABASE_CLIENT);

    const [ownerRegistration, foreignRegistration] = await Promise.all([
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: ownerEmail,
        password,
        tenantName: "Integrations Owner Workspace"
      }),
      request(app.getHttpServer()).post("/api/v1/auth/register").send({
        email: foreignEmail,
        password,
        tenantName: "Integrations Foreign Workspace"
      })
    ]);
    ownerToken = (ownerRegistration.body as AccessTokenResponse).accessToken;

    const [ownerMe, foreignMe] = await Promise.all([
      request(app.getHttpServer())
        .get("/api/v1/me")
        .set("Authorization", `Bearer ${ownerToken}`),
      request(app.getHttpServer())
        .get("/api/v1/me")
        .set(
          "Authorization",
          `Bearer ${(foreignRegistration.body as AccessTokenResponse).accessToken}`
        )
    ]);
    owner = ownerMe.body as AuthenticatedUser;
    foreign = foreignMe.body as AuthenticatedUser;

    await Promise.all([
      database.externalConnection.upsert({
        where: {
          tenantId_userId_provider: {
            tenantId: owner.tenantId,
            userId: owner.userId,
            provider: "GITHUB"
          }
        },
        update: {},
        create: externalConnection(owner, "owner-github")
      }),
      database.externalConnection.upsert({
        where: {
          tenantId_userId_provider: {
            tenantId: foreign.tenantId,
            userId: foreign.userId,
            provider: "GITHUB"
          }
        },
        update: {},
        create: externalConnection(foreign, "foreign-github")
      })
    ]);
  });

  afterAll(async () => {
    if (database) {
      await database.user.deleteMany({
        where: { email: { in: [ownerEmail, foreignEmail] } }
      });
    }
    await app?.close();
  });

  it("returns secret-safe provider statuses for the active tenant user", async () => {
    const response = await request(app!.getHttpServer())
      .get("/api/v1/integrations")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    const body = response.body as IntegrationsStatusResponse;
    expect(body.data.map((item) => item.provider)).toEqual(["GMAIL", "GITHUB"]);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "GITHUB",
          status: "CONNECTED",
          accountLabel: "owner-github",
          missingConfigKeys: []
        })
      ])
    );
    expect(JSON.stringify(body)).not.toContain("foreign-github");
    expect(JSON.stringify(body)).not.toContain("encrypted");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("returns stable OAuth callback errors with correlation IDs", async () => {
    await request(app!.getHttpServer())
      .post("/api/v1/gmail/oauth/callback")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("x-correlation-id", "gmail-callback-correlation")
      .send({ code: "oauth-code", state: "bad-state" })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: "OAUTH_STATE_INVALID",
          correlationId: "gmail-callback-correlation"
        });
      });

    await request(app!.getHttpServer())
      .post("/api/v1/github/oauth/callback")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("x-correlation-id", "github-callback-correlation")
      .send({ code: "oauth-code", state: "bad-state" })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: "OAUTH_STATE_INVALID",
          correlationId: "github-callback-correlation"
        });
      });
  });
});

function externalConnection(
  user: AuthenticatedUser,
  accountEmail: string
): {
  accountEmail: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string;
  expiresAt: Date;
  provider: "GITHUB";
  scopes: string[];
  status: "CONNECTED";
  tenantId: string;
  userId: string;
} {
  return {
    tenantId: user.tenantId,
    userId: user.userId,
    provider: "GITHUB",
    accountEmail,
    scopes: ["repo:read"],
    encryptedAccessToken: `encrypted-access-${accountEmail}`,
    encryptedRefreshToken: `encrypted-refresh-${accountEmail}`,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    status: "CONNECTED"
  };
}

function configureOAuthEnvironment(): void {
  process.env.GMAIL_CLIENT_ID = "gmail-client-id";
  process.env.GMAIL_CLIENT_SECRET = "gmail-client-secret";
  process.env.GMAIL_REDIRECT_URI =
    "https://app.example.com/gmail/oauth/callback";
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "gmail-token-key";
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_CLIENT_ID = "github-client-id";
  process.env.GITHUB_CLIENT_SECRET = "github-client-secret";
  process.env.GITHUB_PRIVATE_KEY = "github-private-key";
  process.env.GITHUB_WEBHOOK_SECRET = "github-webhook-secret";
  process.env.GITHUB_REDIRECT_URI =
    "https://app.example.com/github/oauth/callback";
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "github-token-key";
}

function noopQueue(): { enqueue(): Promise<void> } {
  return {
    enqueue: () => Promise.resolve()
  };
}
