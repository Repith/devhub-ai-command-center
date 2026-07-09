import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AccessTokenResponse,
  AuthenticatedUser,
  NewsFeed
} from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";

import { configureApp } from "../src/app-config";
import { AppModule } from "../src/app.module";
import { DATABASE_CLIENT } from "../src/database/database.module";

const ownerEmail = `news-owner-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";
const describeWithDatabase = process.env.DATABASE_URL
  ? describe
  : describe.skip;

describeWithDatabase("tenant news feeds", () => {
  let app: INestApplication | undefined;
  let database: DatabaseClient | undefined;
  let ownerToken: string;
  let owner: AuthenticatedUser;

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

    const registration = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: ownerEmail,
        password,
        tenantName: "News Workspace"
      });
    ownerToken = (registration.body as AccessTokenResponse).accessToken;
    const me = await request(app.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${ownerToken}`);
    owner = me.body as AuthenticatedUser;
  });

  afterAll(async () => {
    if (database) {
      await database.user.deleteMany({ where: { email: ownerEmail } });
    }
    await app?.close();
  });

  it("creates, audits, rejects duplicates, revives deleted feeds, and enforces member read-only", async () => {
    const createdResponse = await request(app!.getHttpServer())
      .post("/api/v1/news/feeds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(feedInput("https://example.com/feed.xml"))
      .expect(201);
    const created = createdResponse.body as NewsFeed;
    expect(created).toMatchObject({
      name: "Example Feed",
      lastFetchStatus: "NEVER"
    });
    expect(created).not.toHaveProperty("tenantId");

    await request(app!.getHttpServer())
      .post("/api/v1/news/feeds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(feedInput("https://example.com/feed.xml"))
      .expect(409)
      .expect(({ body }: { body: { code: string } }) => {
        expect(body.code).toBe("NEWS_FEED_ALREADY_EXISTS");
      });

    await request(app!.getHttpServer())
      .patch(`/api/v1/news/feeds/${created.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ topic: "Security", enabled: false })
      .expect(200)
      .expect(({ body }: { body: NewsFeed }) => {
        expect(body.topic).toBe("Security");
        expect(body.enabled).toBe(false);
      });

    await request(app!.getHttpServer())
      .delete(`/api/v1/news/feeds/${created.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(204);

    await request(app!.getHttpServer())
      .delete(`/api/v1/news/feeds/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(404)
      .expect(({ body }: { body: { code: string } }) => {
        expect(body.code).toBe("NEWS_FEED_NOT_FOUND");
      });

    const revivedResponse = await request(app!.getHttpServer())
      .post("/api/v1/news/feeds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(feedInput("https://example.com/feed.xml"))
      .expect(201);
    expect((revivedResponse.body as NewsFeed).id).toBe(created.id);

    const audit = await request(app!.getHttpServer())
      .get("/api/v1/audit-log")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(JSON.stringify(audit.body)).toContain("news_feed.created");
    expect(JSON.stringify(audit.body)).not.toContain(owner.tenantId);

    await database!.membership.update({
      where: {
        tenantId_userId: {
          tenantId: owner.tenantId,
          userId: owner.userId
        }
      },
      data: { role: "MEMBER" }
    });

    await request(app!.getHttpServer())
      .get("/api/v1/news/feeds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    await request(app!.getHttpServer())
      .post("/api/v1/news/feeds")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(feedInput("https://example.com/another.xml"))
      .expect(403);
  });
});

function feedInput(url: string): {
  enabled: boolean;
  name: string;
  topic: string;
  url: string;
} {
  return {
    enabled: true,
    name: "Example Feed",
    topic: "AI",
    url
  };
}
