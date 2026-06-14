import { describe, expect, it } from "vitest";

import type {
  GmailConnectionRecord,
  RefreshGmailAccessTokenInput
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import {
  encrypt,
  GmailAccessTokenProvider
} from "../src/gmail-access-token-provider";

describe("GmailAccessTokenProvider", () => {
  it("fails without a tenant/user scoped Gmail connection", async () => {
    const provider = new GmailAccessTokenProvider({
      connections: new FakeConnectionRepository(null),
      tokenEncryptionKey: "test-secret"
    });

    await expect(provider.getAccessToken(context())).rejects.toThrow(
      "Gmail is not connected."
    );
  });

  it("refreshes an expired access token and stores only encrypted token material", async () => {
    const secret = "test-secret";
    const connections = new FakeConnectionRepository(
      gmailConnection({
        encryptedAccessToken: encrypt(secret, "expired-access"),
        encryptedRefreshToken: encrypt(secret, "refresh-token"),
        expiresAt: new Date(Date.now() - 60_000)
      })
    );
    const requests: RequestInit[] = [];
    const provider = new GmailAccessTokenProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      connections,
      fetch: async (_input, init) => {
        requests.push(init ?? {});
        return new Response(
          JSON.stringify({ access_token: "fresh-access", expires_in: 3600 }),
          { status: 200 }
        );
      },
      tokenEncryptionKey: secret
    });

    await expect(provider.getAccessToken(context())).resolves.toBe(
      "fresh-access"
    );

    expect(String(requests[0]?.body)).toContain("refresh-token");
    expect(connections.updated).toHaveLength(1);
    expect(connections.updated[0]?.encryptedAccessToken).not.toContain(
      "fresh-access"
    );
    expect(connections.updated[0]?.status).toBe("CONNECTED");
  });
});

class FakeConnectionRepository {
  public readonly updated: RefreshGmailAccessTokenInput[] = [];

  public constructor(
    private readonly connection: GmailConnectionRecord | null
  ) {}

  public findGmail(): Promise<GmailConnectionRecord | null> {
    return Promise.resolve(this.connection);
  }

  public updateGmailAccessToken(
    _context: TenantContext,
    input: RefreshGmailAccessTokenInput
  ): Promise<GmailConnectionRecord> {
    this.updated.push(input);
    return Promise.resolve(
      gmailConnection({
        encryptedAccessToken: input.encryptedAccessToken,
        encryptedRefreshToken: this.connection?.encryptedRefreshToken ?? null,
        expiresAt: input.expiresAt,
        status: input.status
      })
    );
  }
}

function context(): TenantContext {
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    correlationId: "correlation-test"
  };
}

function gmailConnection(
  input: Partial<GmailConnectionRecord>
): GmailConnectionRecord {
  const now = new Date();
  return {
    id: "00000000-0000-4000-8000-000000000101",
    tenantId: context().tenantId,
    userId: context().userId,
    accountEmail: "me@example.com",
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
    encryptedAccessToken: null,
    encryptedRefreshToken: null,
    expiresAt: null,
    status: "CONNECTED",
    createdAt: now,
    updatedAt: now,
    ...input
  };
}
