import type {
  GmailConnectionRecord,
  GmailDraftReviewRecord
} from "@devhub/database";
import {
  BadRequestException,
  ServiceUnavailableException
} from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GmailService } from "../src/gmail/gmail.service";
import { GmailOAuthStateService } from "../src/gmail/oauth-state.service";
import { TokenCryptoService } from "../src/gmail/token-crypto.service";
import type { RequestPrincipal } from "../src/auth/auth.types";

describe("Gmail security helpers", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("encrypts refresh tokens without leaving plaintext in storage", () => {
    const crypto = new TokenCryptoService();
    const encrypted = crypto.encrypt(
      "local-test-encryption-key",
      "refresh-token-secret"
    );

    expect(encrypted).not.toContain("refresh-token-secret");
    expect(crypto.decrypt("local-test-encryption-key", encrypted)).toBe(
      "refresh-token-secret"
    );
  });

  it("binds OAuth state to the active tenant and user", () => {
    const states = new GmailOAuthStateService();
    const state = states.sign("state-secret", "tenant-1", "user-1");

    expect(() =>
      states.verify("state-secret", state, "tenant-1", "user-1")
    ).not.toThrow();
    expect(() =>
      states.verify("state-secret", state, "tenant-2", "user-1")
    ).toThrow("OAuth state does not match the active principal.");
  });

  it("requires a connected Gmail account before sending a draft review", async () => {
    process.env.GMAIL_CLIENT_ID = "client-id";
    process.env.GMAIL_CLIENT_SECRET = "client-secret";
    process.env.GMAIL_REDIRECT_URI = "http://localhost/callback";
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "local-test-encryption-key";
    const service = gmailService({
      connections: { findGmail: () => Promise.resolve(null) },
      draftReviews: {
        findById: () => Promise.resolve(gmailDraftReviewRecord())
      }
    });

    await expect(
      service.sendDraftReview(principal(), gmailDraftReviewRecord().id)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reports missing OAuth config keys and supports local mock connection", async () => {
    process.env.GMAIL_DEV_MOCK_ENABLED = "true";
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "local-test-encryption-key";
    const upserts: unknown[] = [];
    const service = gmailService({
      connections: {
        findGmail: () => Promise.resolve(null),
        upsertGmail: (input: unknown) => {
          upserts.push(input);
          return Promise.resolve(null);
        }
      }
    });

    await expect(service.status(principal())).resolves.toMatchObject({
      status: "DISCONNECTED",
      missingConfigKeys: [
        "GMAIL_CLIENT_ID",
        "GMAIL_CLIENT_SECRET",
        "GMAIL_REDIRECT_URI"
      ]
    });
    await service.connectDevMock(principal());
    expect(JSON.stringify(upserts)).not.toContain(
      "devhub-gmail-mock-access-token"
    );
  });

  it("builds an offline incremental OAuth authorization URL", () => {
    process.env.GMAIL_CLIENT_ID = "client-id";
    process.env.GMAIL_CLIENT_SECRET = "client-secret";
    process.env.GMAIL_REDIRECT_URI =
      "http://localhost:3000/gmail/oauth/callback";
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "local-test-encryption-key";
    const service = gmailService({});

    const response = service.connect(principal());
    const url = new URL(response.authorizationUrl);

    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/gmail/oauth/callback"
    );
    expect(url.searchParams.get("scope")).toContain(
      "https://www.googleapis.com/auth/gmail.readonly"
    );
    expect(url.searchParams.get("scope")).toContain(
      "https://www.googleapis.com/auth/gmail.compose"
    );
    expect(url.searchParams.get("state")).toEqual(expect.any(String));
  });

  it("completes OAuth with encrypted tokens and metadata-only audit", async () => {
    configureOAuthEnv();
    const audit = { records: [] as unknown[] };
    const upserts: unknown[] = [];
    const service = gmailService({
      audit,
      connections: {
        upsertGmail: (input: unknown) => {
          upserts.push(input);
          return Promise.resolve(input);
        }
      }
    });
    stubGoogleOAuth({
      token: {
        access_token: "access-token-secret",
        refresh_token: "refresh-token-secret",
        expires_in: 3600,
        scope:
          "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose"
      },
      profile: { emailAddress: "owner@example.com" }
    });

    await service.completeOAuth(principal(), {
      code: "auth-code",
      state: oauthState()
    });

    const serializedUpserts = JSON.stringify(upserts);
    expect(serializedUpserts).not.toContain("access-token-secret");
    expect(serializedUpserts).not.toContain("refresh-token-secret");
    expect(audit.records).toEqual([
      expect.objectContaining({
        action: "gmail.connected",
        metadata: {
          provider: "GMAIL",
          accountEmail: "owner@example.com",
          scopes: [
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.compose"
          ]
        }
      })
    ]);
  });

  it("rejects a bad OAuth state with a stable error code", async () => {
    configureOAuthEnv();
    const service = gmailService({});

    await expect(
      service.completeOAuth(principal(), {
        code: "auth-code",
        state: "invalid-state"
      })
    ).rejects.toMatchObject({
      response: {
        code: "OAUTH_STATE_INVALID",
        message: "Invalid Gmail OAuth state."
      }
    });
  });

  it("rejects OAuth callbacks when Google omits a refresh token", async () => {
    configureOAuthEnv();
    const service = gmailService({});
    stubGoogleOAuth({
      token: {
        access_token: "access-token-secret",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/gmail.readonly"
      },
      profile: { emailAddress: "owner@example.com" }
    });

    await expect(
      service.completeOAuth(principal(), {
        code: "auth-code",
        state: oauthState()
      })
    ).rejects.toMatchObject({
      response: {
        code: "GMAIL_REFRESH_TOKEN_MISSING",
        message: "Google did not return a refresh token."
      }
    });
  });

  it("maps Google token exchange failures to a typed error", async () => {
    configureOAuthEnv();
    const service = gmailService({});
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "invalid_grant" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          })
        )
      )
    );

    await expect(
      service.completeOAuth(principal(), {
        code: "auth-code",
        state: oauthState()
      })
    ).rejects.toMatchObject({
      response: {
        code: "GMAIL_OAUTH_EXCHANGE_FAILED",
        message: "Google OAuth token exchange failed."
      }
    });
  });

  it("disconnects Gmail without requiring provider config values in output", async () => {
    configureOAuthEnv();
    const audit = { records: [] as unknown[] };
    const service = gmailService({
      audit,
      connection: gmailConnectionRecord()
    });

    await expect(service.disconnect(principal())).resolves.toMatchObject({
      status: "DISCONNECTED",
      accountEmail: null,
      scopes: [],
      missingConfigKeys: []
    });
    expect(JSON.stringify(audit.records)).not.toContain("access-token-secret");
    expect(JSON.stringify(audit.records)).not.toContain("refresh-token-secret");
    expect(audit.records).toEqual([
      expect.objectContaining({
        action: "gmail.disconnected",
        metadata: { provider: "GMAIL" }
      })
    ]);
  });

  it("returns a stable misconfigured code for OAuth actions", () => {
    delete process.env.GMAIL_CLIENT_ID;
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_REDIRECT_URI;
    delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    const service = gmailService({});

    expect(() => service.connect(principal())).toThrow(
      ServiceUnavailableException
    );
    try {
      service.connect(principal());
    } catch (error) {
      expect(
        (error as ServiceUnavailableException).getResponse()
      ).toMatchObject({
        code: "GMAIL_OAUTH_MISCONFIGURED",
        missingConfigKeys: expect.arrayContaining([
          "GMAIL_CLIENT_ID",
          "GMAIL_CLIENT_SECRET",
          "GMAIL_REDIRECT_URI",
          "GMAIL_TOKEN_ENCRYPTION_KEY"
        ])
      });
    }
  });

  it("audits draft review metadata without message body content", async () => {
    const audit = { records: [] as unknown[] };
    const service = gmailService({
      audit,
      draftReviews: {
        reject: () =>
          Promise.resolve(
            gmailDraftReviewRecord({ body: "SECRET_BODY should not audit." })
          )
      }
    });

    await service.rejectDraftReview(principal(), gmailDraftReviewRecord().id);

    expect(JSON.stringify(audit.records)).not.toContain("SECRET_BODY");
    expect(audit.records).toEqual([
      expect.objectContaining({
        action: "gmail.draft_review.rejected",
        metadata: expect.objectContaining({
          recipientCount: 1,
          ccCount: 0,
          hasThread: true
        })
      })
    ]);
  });
});

function gmailService(options: {
  audit?: { records: unknown[] };
  connection?: GmailConnectionRecord | null;
  connections?: {
    findGmail?(): Promise<GmailConnectionRecord | null>;
    upsertGmail?(input: unknown): Promise<unknown>;
    disconnect?(): Promise<unknown>;
  };
  draftReviews?: {
    findById?(): Promise<GmailDraftReviewRecord | null>;
    reject?(): Promise<GmailDraftReviewRecord | null>;
  };
}): GmailService {
  const audit = options.audit ?? { records: [] as unknown[] };
  let currentConnection = options.connection ?? null;
  return new GmailService(
    {
      findGmail:
        options.connections?.findGmail ??
        (() => Promise.resolve(currentConnection)),
      upsertGmail: (_context: unknown, input: unknown) => {
        currentConnection = gmailConnectionRecord(
          input as Partial<GmailConnectionRecord>
        );
        return options.connections?.upsertGmail
          ? options.connections.upsertGmail(input)
          : Promise.resolve(currentConnection);
      },
      disconnect: () => {
        currentConnection = gmailConnectionRecord({
          accountEmail: null,
          scopes: [],
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          expiresAt: null,
          status: "DISCONNECTED"
        });
        return options.connections?.disconnect
          ? options.connections.disconnect()
          : Promise.resolve(currentConnection);
      }
    } as never,
    {
      findById:
        options.draftReviews?.findById ??
        (() => Promise.resolve(gmailDraftReviewRecord())),
      reject:
        options.draftReviews?.reject ??
        (() => Promise.resolve(gmailDraftReviewRecord()))
    } as never,
    {
      record: (_principal: unknown, entry: unknown) => {
        audit.records.push(entry);
        return Promise.resolve();
      }
    } as never,
    new TokenCryptoService(),
    new GmailOAuthStateService()
  );
}

function configureOAuthEnv(): void {
  process.env.GMAIL_CLIENT_ID = "client-id";
  process.env.GMAIL_CLIENT_SECRET = "client-secret";
  process.env.GMAIL_REDIRECT_URI = "http://localhost:3000/gmail/oauth/callback";
  process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "local-test-encryption-key";
  process.env.JWT_SECRET = "local-jwt-secret";
}

function oauthState(): string {
  return new GmailOAuthStateService().sign(
    process.env.JWT_SECRET!,
    principal().tenantId,
    principal().userId
  );
}

function stubGoogleOAuth(input: {
  token: Record<string, unknown>;
  profile: Record<string, unknown>;
}): void {
  const fetchMock = vi.fn((url: string | URL | Request) => {
    const target = String(url);
    const body = target.includes("oauth2.googleapis.com")
      ? input.token
      : input.profile;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
  });
  vi.stubGlobal("fetch", fetchMock);
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

function gmailDraftReviewRecord(
  input: Partial<GmailDraftReviewRecord> = {}
): GmailDraftReviewRecord {
  const now = new Date();
  return {
    id: "00000000-0000-4000-8000-000000000101",
    tenantId: principal().tenantId,
    userId: principal().userId,
    agentRunId: null,
    threadId: "thread-1",
    gmailDraftId: "draft-1",
    to: ["client@example.com"],
    cc: [],
    subject: "Re: Update",
    body: "Thanks for the note.",
    status: "NEEDS_REVIEW",
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    ...input
  };
}

function gmailConnectionRecord(
  input: Partial<GmailConnectionRecord> = {}
): GmailConnectionRecord {
  const now = new Date();
  return {
    id: "00000000-0000-4000-8000-000000000201",
    tenantId: principal().tenantId,
    userId: principal().userId,
    provider: "GMAIL",
    accountEmail: "owner@example.com",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose"
    ],
    encryptedAccessToken: "encrypted-access-token-secret",
    encryptedRefreshToken: "encrypted-refresh-token-secret",
    expiresAt: new Date(Date.now() + 3600 * 1000),
    status: "CONNECTED",
    createdAt: now,
    updatedAt: now,
    ...input
  };
}
