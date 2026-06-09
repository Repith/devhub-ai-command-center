import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AccessTokenResponse, AuthenticatedUser } from "@devhub/contracts";
import type { DatabaseClient } from "@devhub/database";

import { configureApp } from "../src/app-config";
import { AppModule } from "../src/app.module";
import { DATABASE_CLIENT } from "../src/database/database.module";

const jwtSecret = "integration-secret-with-at-least-32-characters";
const alphaEmail = `alpha-${crypto.randomUUID()}@example.com`;
const betaEmail = `beta-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";

interface AccessClaims {
  sub: string;
  tenantId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  sessionId: string;
}

function refreshCookie(response: request.Response): string {
  const values = response.headers["set-cookie"];
  const value = Array.isArray(values) ? values[0] : values;
  if (!value) {
    throw new Error("Refresh cookie was not returned.");
  }
  return value.split(";")[0]!;
}

describe("authentication and tenancy", () => {
  let app: INestApplication | undefined;
  let database: DatabaseClient | undefined;
  let alphaAccessToken: string;
  let alphaCookie: string;
  let alphaUser: AuthenticatedUser;
  let betaUser: AuthenticatedUser;

  beforeAll(async () => {
    process.env.JWT_SECRET = jwtSecret;
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
  });

  afterAll(async () => {
    if (database) {
      await database.user.deleteMany({
        where: { email: { in: [alphaEmail, betaEmail] } }
      });
    }
    await app?.close();
  });

  it("registers owners and derives tenant context from the access token", async () => {
    const alpha = await request(app!.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: alphaEmail,
        password,
        tenantName: "Alpha Test Workspace"
      })
      .expect(201);
    alphaAccessToken = (alpha.body as AccessTokenResponse).accessToken;
    alphaCookie = refreshCookie(alpha);

    const beta = await request(app!.getHttpServer())
      .post("/api/v1/auth/register")
      .send({
        email: betaEmail,
        password,
        tenantName: "Beta Test Workspace"
      })
      .expect(201);

    const alphaMe = await request(app!.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${alphaAccessToken}`)
      .expect(200);
    const betaMe = await request(app!.getHttpServer())
      .get("/api/v1/me")
      .set(
        "Authorization",
        `Bearer ${(beta.body as AccessTokenResponse).accessToken}`
      )
      .expect(200);

    alphaUser = alphaMe.body as AuthenticatedUser;
    betaUser = betaMe.body as AuthenticatedUser;
    expect(alphaUser.tenantId).not.toBe(betaUser.tenantId);
    expect(alphaUser.role).toBe("OWNER");
    expect(betaUser.role).toBe("OWNER");
  });

  it("rotates refresh tokens and revokes the family when an old token is reused", async () => {
    const rotated = await request(app!.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", alphaCookie)
      .expect(200);
    const rotatedCookie = refreshCookie(rotated);

    await request(app!.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", alphaCookie)
      .expect(401);
    await request(app!.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", rotatedCookie)
      .expect(401);
  });

  it("rejects a signed token whose tenant does not match its session", async () => {
    const login = await request(app!.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: alphaEmail, password })
      .expect(200);
    const access = (login.body as AccessTokenResponse).accessToken;
    const jwt = new JwtService();
    const claims = jwt.decode<AccessClaims>(access);
    const forged = await jwt.signAsync(
      {
        sub: claims.sub,
        tenantId: betaUser.tenantId,
        role: claims.role,
        sessionId: claims.sessionId
      },
      {
        secret: jwtSecret,
        algorithm: "HS256",
        issuer: "devhub-ai-command-center",
        audience: "devhub-api",
        expiresIn: 900
      }
    );

    await request(app!.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${forged}`)
      .expect(401);
  });

  it("revokes the active session on logout", async () => {
    const login = await request(app!.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: betaEmail, password })
      .expect(200);
    const cookie = refreshCookie(login);
    const accessToken = (login.body as AccessTokenResponse).accessToken;

    await request(app!.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", cookie)
      .expect(204);
    await request(app!.getHttpServer())
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);
    await request(app!.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie)
      .expect(401);
  });

  it("uses the shared error envelope for invalid credentials", async () => {
    const response = await request(app!.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: alphaEmail, password: "definitely-wrong-password" })
      .expect(401);

    expect(response.body).toMatchObject({
      code: "UNAUTHORIZED",
      details: {}
    });
    expect(response.body.correlationId).toEqual(expect.any(String));
  });
});
