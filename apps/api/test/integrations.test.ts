import { afterEach, describe, expect, it } from "vitest";

import type { ExternalConnectionRecord } from "@devhub/database";

import type { RequestPrincipal } from "../src/auth/auth.types";
import { IntegrationsService } from "../src/integrations/integrations.service";

describe("IntegrationsService", () => {
  const previousEnvironment = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnvironment };
  });

  it("reports missing provider config without exposing secret values", async () => {
    clearOAuthEnvironment();
    const service = integrationsService({});

    await expect(service.list(principal())).resolves.toEqual({
      data: [
        expect.objectContaining({
          provider: "GMAIL",
          status: "MISCONFIGURED",
          missingConfigKeys: expect.arrayContaining(["GMAIL_CLIENT_ID"])
        }),
        expect.objectContaining({
          provider: "GITHUB",
          status: "MISCONFIGURED",
          missingConfigKeys: expect.arrayContaining(["GITHUB_APP_ID"])
        })
      ]
    });
  });

  it("reports connected Gmail and disconnected GitHub when configured", async () => {
    configureOAuthEnvironment();
    const service = integrationsService({
      GMAIL: connection({ provider: "GMAIL" })
    });

    await expect(service.list(principal())).resolves.toEqual({
      data: [
        expect.objectContaining({
          provider: "GMAIL",
          status: "CONNECTED",
          accountLabel: "gmail@example.com",
          missingConfigKeys: []
        }),
        expect.objectContaining({
          provider: "GITHUB",
          status: "DISCONNECTED",
          accountLabel: null,
          missingConfigKeys: []
        })
      ]
    });
  });
});

function integrationsService(
  records: Partial<Record<"GMAIL" | "GITHUB", ExternalConnectionRecord>>
): IntegrationsService {
  return new IntegrationsService({
    find: (_context: unknown, provider: "GMAIL" | "GITHUB") =>
      Promise.resolve(records[provider] ?? null)
  } as never);
}

function connection(input: {
  provider: "GMAIL" | "GITHUB";
}): ExternalConnectionRecord {
  const now = new Date("2026-06-09T12:00:00.000Z");
  return {
    id: "connection-1",
    tenantId: principal().tenantId,
    userId: principal().userId,
    provider: input.provider,
    accountEmail:
      input.provider === "GMAIL" ? "gmail@example.com" : "github-user",
    scopes: ["scope.read"],
    encryptedAccessToken: "encrypted-access-token",
    encryptedRefreshToken: "encrypted-refresh-token",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    status: "CONNECTED",
    createdAt: now,
    updatedAt: now
  };
}

function principal(): RequestPrincipal {
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    sessionId: "session-test",
    role: "OWNER",
    email: "owner@example.com",
    displayName: "Owner",
    tenantName: "Tenant",
    tenantSlug: "tenant"
  };
}

function clearOAuthEnvironment(): void {
  for (const key of [
    "GMAIL_CLIENT_ID",
    "GMAIL_CLIENT_SECRET",
    "GMAIL_REDIRECT_URI",
    "GMAIL_TOKEN_ENCRYPTION_KEY",
    "GMAIL_DEV_MOCK_ENABLED",
    "GITHUB_APP_ID",
    "GITHUB_CLIENT_ID",
    "GITHUB_CLIENT_SECRET",
    "GITHUB_PRIVATE_KEY",
    "GITHUB_WEBHOOK_SECRET",
    "GITHUB_REDIRECT_URI",
    "GITHUB_TOKEN_ENCRYPTION_KEY"
  ]) {
    delete process.env[key];
  }
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
