import { createHmac } from "node:crypto";

import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ExternalConnectionRecord,
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
      disconnectGithub:
        options.installations?.disconnectGithub ??
        (() => Promise.resolve(null)),
      markGithubInstallation:
        options.installations?.markGithubInstallation ??
        (() => Promise.resolve({ count: 0 }))
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
