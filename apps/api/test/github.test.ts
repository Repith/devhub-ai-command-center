import { createHmac } from "node:crypto";

import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ExternalConnectionRecord,
  ExternalRepositoryRecord,
  GithubActionReviewRecord,
  SyncExternalInstallationInput
} from "@devhub/database";

import type { RequestPrincipal } from "../src/auth/auth.types";
import { GithubService } from "../src/github/github.service";
import { GithubOAuthStateService } from "../src/github/oauth-state.service";
import { GithubTokenCryptoService } from "../src/github/token-crypto.service";

describe("GithubService", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports misconfiguration with key names only", async () => {
    clearGithubEnvironment();
    const service = githubService({});

    await expect(service.status(principal())).resolves.toMatchObject({
      provider: "GITHUB",
      status: "MISCONFIGURED",
      missingConfigKeys: expect.arrayContaining(["GITHUB_APP_ID"])
    });
    expect(() => service.connect(principal())).toThrow(
      ServiceUnavailableException
    );
  });

  it("builds a GitHub OAuth URL bound to signed state", () => {
    configureGithubEnvironment();
    const service = githubService({});

    const response = service.connect(principal());
    const url = new URL(response.authorizationUrl);

    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("client_id")).toBe("github-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/github/oauth/callback"
    );
    expect(url.searchParams.get("state")).toEqual(expect.any(String));
  });

  it("completes OAuth without storing plaintext tokens", async () => {
    configureGithubEnvironment();
    const audit = { records: [] as unknown[] };
    const upserts: unknown[] = [];
    const service = githubService({
      audit,
      connections: {
        upsert: (_context, input) => {
          upserts.push(input);
          return Promise.resolve(githubConnection(input));
        }
      }
    });
    stubGithubFetch([
      {
        match: "login/oauth/access_token",
        body: {
          access_token: "github-access-secret",
          refresh_token: "github-refresh-secret",
          expires_in: 3600,
          scope: ""
        }
      },
      { match: "/user", body: { login: "octo-user" } }
    ]);

    await service.completeOAuth(principal(), {
      code: "oauth-code",
      state: oauthState()
    });

    const serialized = JSON.stringify({ upserts, audit: audit.records });
    expect(serialized).not.toContain("github-access-secret");
    expect(serialized).not.toContain("github-refresh-secret");
    expect(audit.records).toEqual([
      expect.objectContaining({
        action: "github.connected",
        metadata: { provider: "GITHUB", accountLogin: "octo-user" }
      })
    ]);
  });

  it("rejects a bad OAuth state with a stable error code", async () => {
    configureGithubEnvironment();
    const service = githubService({});

    await expect(
      service.completeOAuth(principal(), {
        code: "oauth-code",
        state: "bad-state"
      })
    ).rejects.toMatchObject({
      response: {
        code: "OAUTH_STATE_INVALID",
        message: "Invalid GitHub OAuth state."
      }
    });
  });

  it("syncs GitHub installations and repositories from the user token", async () => {
    configureGithubEnvironment();
    const synced: SyncExternalInstallationInput[][] = [];
    const service = githubService({
      connection: githubConnection({
        encryptedAccessToken: encrypted("token")
      }),
      installations: {
        syncGithubInstallations: (_context, input) => {
          synced.push([...input]);
          return Promise.resolve({
            installations: [{ id: "installation-record" }],
            repositories: [{ id: "repository-record" }]
          });
        },
        countActive: () =>
          Promise.resolve({ installations: 1, repositories: 1 })
      }
    });
    stubGithubFetch([
      {
        match: "/user/installations",
        body: {
          installations: [
            {
              id: 123,
              account: { login: "octo-org", type: "Organization" },
              repository_selection: "selected",
              permissions: { contents: "read" }
            }
          ]
        }
      },
      {
        match: "/user/installations/123/repositories",
        body: {
          repositories: [
            {
              id: 456,
              owner: { login: "octo-org" },
              name: "hello-world",
              full_name: "octo-org/hello-world",
              private: false,
              default_branch: "main",
              html_url: "https://github.com/octo-org/hello-world"
            }
          ]
        }
      }
    ]);

    await expect(service.syncInstallations(principal())).resolves.toMatchObject(
      {
        installationCount: 1,
        repositoryCount: 1
      }
    );
    expect(synced[0]).toEqual([
      expect.objectContaining({
        providerInstallationId: "123",
        accountLogin: "octo-org",
        repositories: [
          expect.objectContaining({
            providerRepositoryId: "456",
            fullName: "octo-org/hello-world"
          })
        ]
      })
    ]);
  });

  it("disconnects connection and installation metadata", async () => {
    configureGithubEnvironment();
    const calls: string[] = [];
    const service = githubService({
      connection: githubConnection(),
      connections: {
        disconnect: () => {
          calls.push("connection");
          return Promise.resolve(githubConnection({ status: "DISCONNECTED" }));
        }
      },
      installations: {
        disconnectGithub: () => {
          calls.push("installations");
          return Promise.resolve(null);
        }
      }
    });

    await expect(service.disconnect(principal())).resolves.toMatchObject({
      status: "DISCONNECTED"
    });
    expect(calls.sort()).toEqual(["connection", "installations"]);
  });

  it("validates webhook signatures and applies installation actions", async () => {
    configureGithubEnvironment();
    const marked: unknown[] = [];
    const service = githubService({
      installations: {
        markGithubInstallation: (id, status) => {
          marked.push({ id, status });
          return Promise.resolve({ count: 1 });
        }
      }
    });
    const payload = { action: "deleted", installation: { id: 123 } };

    await expect(
      service.handleWebhook({
        event: "installation",
        payload,
        signature: signature(payload)
      })
    ).resolves.toEqual({ accepted: true });
    expect(marked).toEqual([{ id: "123", status: "DELETED" }]);
    await expect(
      service.handleWebhook({
        event: "installation",
        payload,
        signature: "sha256=bad"
      })
    ).rejects.toMatchObject({
      response: { code: "GITHUB_WEBHOOK_SIGNATURE_INVALID" }
    });
  });

  it("submits reviewed issue comments through an authenticated API action", async () => {
    configureGithubEnvironment();
    const audit = { records: [] as unknown[] };
    const submitted: unknown[] = [];
    const service = githubService({
      audit,
      connection: githubConnection({
        encryptedAccessToken: encrypted("github-access-token")
      }),
      actionReviews: {
        findById: () => Promise.resolve(githubActionReview()),
        markSent: (_context, _id, input) =>
          Promise.resolve(
            githubActionReview({
              status: "SENT",
              externalUrl: input.externalUrl,
              sentAt: new Date("2026-07-09T12:05:00.000Z")
            })
          )
      },
      installations: {
        findActiveRepositoryByFullName: () =>
          Promise.resolve(githubRepository())
      }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (
          url: string | URL | Request,
          init: RequestInit | undefined
        ): Promise<Response> => {
          submitted.push({ url: String(url), init });
          return Promise.resolve(
            new Response(
              JSON.stringify({
                html_url:
                  "https://github.com/octo-org/hello-world/issues/7#comment-1"
              }),
              { status: 201, headers: { "Content-Type": "application/json" } }
            )
          );
        }
      )
    );

    await expect(
      service.submitActionReview(principal(), githubActionReview().id)
    ).resolves.toMatchObject({
      status: "SENT",
      externalUrl: "https://github.com/octo-org/hello-world/issues/7#comment-1"
    });

    expect(submitted).toHaveLength(1);
    expect(JSON.stringify(submitted)).toContain(
      "/repos/octo-org/hello-world/issues/7/comments"
    );
    expect(JSON.stringify(submitted)).toContain("github-access-token");
    const serializedAudit = JSON.stringify(audit.records);
    expect(serializedAudit).toContain("github.action_review.sent");
    expect(serializedAudit).not.toContain("Approved body should stay secret");
  });

  it("rejects reviewed GitHub actions without leaking the body", async () => {
    configureGithubEnvironment();
    const audit = { records: [] as unknown[] };
    const service = githubService({
      audit,
      actionReviews: {
        reject: () =>
          Promise.resolve(githubActionReview({ status: "REJECTED" }))
      }
    });

    await expect(
      service.rejectActionReview(principal(), githubActionReview().id)
    ).resolves.toMatchObject({ status: "REJECTED" });
    expect(JSON.stringify(audit.records)).not.toContain(
      "Approved body should stay secret"
    );
  });

  it("does not submit terminal GitHub action reviews", async () => {
    configureGithubEnvironment();
    const service = githubService({
      actionReviews: {
        findById: () =>
          Promise.resolve(githubActionReview({ status: "REJECTED" }))
      }
    });

    await expect(
      service.submitActionReview(principal(), githubActionReview().id)
    ).rejects.toMatchObject({
      response: { message: "GitHub action review was not found." }
    });
  });
});

function githubService(options: {
  audit?: { records: unknown[] };
  connection?: ExternalConnectionRecord | null;
  connections?: {
    upsert?(
      context: unknown,
      input: Record<string, unknown>
    ): Promise<ExternalConnectionRecord>;
    disconnect?(): Promise<ExternalConnectionRecord>;
  };
  installations?: {
    countActive?(): Promise<{ installations: number; repositories: number }>;
    findActiveRepositoryByFullName?(): Promise<ExternalRepositoryRecord | null>;
    syncGithubInstallations?(
      context: unknown,
      input: readonly SyncExternalInstallationInput[]
    ): Promise<{ installations: unknown[]; repositories: unknown[] }>;
    listRepositories?(): Promise<unknown[]>;
    disconnectGithub?(): Promise<unknown>;
    markGithubInstallation?(
      id: string,
      status: string
    ): Promise<{ count: number }>;
  };
  actionReviews?: {
    list?(): Promise<GithubActionReviewRecord[]>;
    findById?(): Promise<GithubActionReviewRecord | null>;
    create?(): Promise<GithubActionReviewRecord>;
    update?(): Promise<GithubActionReviewRecord | null>;
    reject?(): Promise<GithubActionReviewRecord | null>;
    markSent?(
      context: unknown,
      id: string,
      input: { externalUrl: string }
    ): Promise<GithubActionReviewRecord | null>;
  };
}): GithubService {
  let currentConnection = options.connection ?? null;
  const audit = options.audit ?? { records: [] as unknown[] };
  return new GithubService(
    {
      find: () => Promise.resolve(currentConnection),
      upsert: (context: unknown, input: Record<string, unknown>) =>
        options.connections?.upsert
          ? options.connections.upsert(context, input)
          : Promise.resolve(githubConnection(input)),
      disconnect: () => {
        currentConnection = githubConnection({ status: "DISCONNECTED" });
        return options.connections?.disconnect
          ? options.connections.disconnect()
          : Promise.resolve(currentConnection);
      }
    } as never,
    {
      countActive:
        options.installations?.countActive ??
        (() => Promise.resolve({ installations: 0, repositories: 0 })),
      syncGithubInstallations:
        options.installations?.syncGithubInstallations ??
        (() => Promise.resolve({ installations: [], repositories: [] })),
      listRepositories:
        options.installations?.listRepositories ?? (() => Promise.resolve([])),
      findActiveRepositoryByFullName:
        options.installations?.findActiveRepositoryByFullName ??
        (() => Promise.resolve(githubRepository())),
      disconnectGithub:
        options.installations?.disconnectGithub ??
        (() => Promise.resolve(null)),
      markGithubInstallation:
        options.installations?.markGithubInstallation ??
        (() => Promise.resolve({ count: 0 }))
    } as never,
    {
      list:
        options.actionReviews?.list ??
        (() => Promise.resolve([githubActionReview()])),
      findById:
        options.actionReviews?.findById ??
        (() => Promise.resolve(githubActionReview())),
      create:
        options.actionReviews?.create ??
        (() => Promise.resolve(githubActionReview())),
      update:
        options.actionReviews?.update ??
        (() => Promise.resolve(githubActionReview({ status: "UPDATED" }))),
      reject:
        options.actionReviews?.reject ??
        (() => Promise.resolve(githubActionReview({ status: "REJECTED" }))),
      markSent:
        options.actionReviews?.markSent ??
        (() => Promise.resolve(githubActionReview({ status: "SENT" })))
    } as never,
    {
      record: (_principal: unknown, entry: unknown) => {
        audit.records.push(entry);
        return Promise.resolve();
      }
    } as never,
    new GithubTokenCryptoService(),
    new GithubOAuthStateService()
  );
}

function configureGithubEnvironment(): void {
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_CLIENT_ID = "github-client-id";
  process.env.GITHUB_CLIENT_SECRET = "github-client-secret";
  process.env.GITHUB_PRIVATE_KEY = "github-private-key";
  process.env.GITHUB_WEBHOOK_SECRET = "github-webhook-secret";
  process.env.GITHUB_REDIRECT_URI =
    "https://app.example.com/github/oauth/callback";
  process.env.GITHUB_TOKEN_ENCRYPTION_KEY = "github-token-key";
  process.env.JWT_SECRET = "local-jwt-secret";
}

function clearGithubEnvironment(): void {
  for (const key of [
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

function oauthState(): string {
  return new GithubOAuthStateService().sign(
    process.env.JWT_SECRET!,
    principal().tenantId,
    principal().userId
  );
}

function encrypted(token: string): string {
  return new GithubTokenCryptoService().encrypt(
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY!,
    token
  );
}

function signature(payload: unknown): string {
  return `sha256=${createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!)
    .update(JSON.stringify(payload))
    .digest("hex")}`;
}

function stubGithubFetch(
  responses: { match: string; body: Record<string, unknown> }[]
): void {
  const orderedResponses = [...responses].sort(
    (left, right) => right.match.length - left.match.length
  );
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL | Request) => {
      const target = String(url);
      const response = orderedResponses.find((item) =>
        target.includes(item.match)
      );
      if (!response) {
        return Promise.resolve(new Response("{}", { status: 404 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify(response.body), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      );
    })
  );
}

function githubConnection(
  input: Partial<ExternalConnectionRecord> = {}
): ExternalConnectionRecord {
  const now = new Date("2026-06-09T12:00:00.000Z");
  return {
    id: "00000000-0000-4000-8000-000000000301",
    tenantId: principal().tenantId,
    userId: principal().userId,
    provider: "GITHUB",
    accountEmail: "octo-user",
    scopes: [],
    encryptedAccessToken: encrypted("github-access-token"),
    encryptedRefreshToken: null,
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    status: "CONNECTED",
    createdAt: now,
    updatedAt: now,
    ...input
  };
}

function githubRepository(): ExternalRepositoryRecord {
  const now = new Date("2026-07-09T12:00:00.000Z");
  return {
    id: "00000000-0000-4000-8000-000000000501",
    tenantId: principal().tenantId,
    installationId: "00000000-0000-4000-8000-000000000502",
    provider: "GITHUB",
    providerRepositoryId: "456",
    owner: "octo-org",
    name: "hello-world",
    fullName: "octo-org/hello-world",
    private: false,
    defaultBranch: "main",
    htmlUrl: "https://github.com/octo-org/hello-world",
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  };
}

function githubActionReview(
  input: Partial<GithubActionReviewRecord> = {}
): GithubActionReviewRecord {
  const now = new Date("2026-07-09T12:00:00.000Z");
  return {
    id: "00000000-0000-4000-8000-000000000601",
    tenantId: principal().tenantId,
    userId: principal().userId,
    repositoryId: githubRepository().id,
    repositoryFullName: "octo-org/hello-world",
    kind: "ISSUE_COMMENT",
    issueNumber: 7,
    pullRequestNumber: null,
    title: null,
    body: "Approved body should stay secret",
    status: "NEEDS_REVIEW",
    externalUrl: null,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    ...input
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
