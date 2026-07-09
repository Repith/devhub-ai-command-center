import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ExternalConnectionRecord } from "@devhub/database";

import {
  GithubAccessTokenProvider,
  encrypt
} from "../src/github-access-token-provider";

const tokenKey = "github-token-key";

describe("GithubAccessTokenProvider", () => {
  it("decrypts an unexpired server-side GitHub token", async () => {
    const provider = new GithubAccessTokenProvider({
      tokenEncryptionKey: tokenKey,
      connections: {
        find: () =>
          Promise.resolve(
            connection({ encryptedAccessToken: encrypt(tokenKey, "secret") })
          ),
        updateAccessToken: vi.fn()
      }
    });

    await expect(provider.getAccessToken(context())).resolves.toBe("secret");
  });

  it("refreshes expired GitHub tokens without persisting plaintext", async () => {
    const updates: unknown[] = [];
    const provider = new GithubAccessTokenProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      tokenEncryptionKey: tokenKey,
      connections: {
        find: () =>
          Promise.resolve(
            connection({
              encryptedAccessToken: encrypt(tokenKey, "old-token"),
              encryptedRefreshToken: encrypt(tokenKey, "refresh-secret"),
              expiresAt: new Date(Date.now() - 60_000)
            })
          ),
        updateAccessToken: (_context, _provider, input) => {
          updates.push(input);
          return Promise.resolve(connection());
        }
      },
      fetch: (async () =>
        new Response(JSON.stringify({ access_token: "new-secret" }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })) as typeof fetch
    });

    await expect(provider.getAccessToken(context())).resolves.toBe(
      "new-secret"
    );
    expect(JSON.stringify(updates)).not.toContain("new-secret");
    expect(JSON.stringify(updates)).not.toContain("refresh-secret");
  });

  it("creates short-lived installation tokens without persisting them", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: {
        format: "pem",
        type: "pkcs8"
      },
      publicKeyEncoding: {
        format: "pem",
        type: "spki"
      }
    });
    const updates: unknown[] = [];
    const requests: Array<{ init?: RequestInit; url: string }> = [];
    const provider = new GithubAccessTokenProvider({
      appId: "12345",
      privateKey,
      tokenEncryptionKey: tokenKey,
      connections: {
        find: vi.fn(),
        updateAccessToken: (_context, _provider, input) => {
          updates.push(input);
          return Promise.resolve(connection());
        }
      },
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({
          url: requestUrl(input),
          ...(init === undefined ? {} : { init })
        });
        return new Response(JSON.stringify({ token: "installation-secret" }), {
          status: 201,
          headers: { "Content-Type": "application/json" }
        });
      }) as typeof fetch
    });

    await expect(
      provider.getAccessToken(context(), { providerInstallationId: "999" })
    ).resolves.toBe("installation-secret");

    expect(requests[0]?.url).toBe(
      "https://api.github.com/app/installations/999/access_tokens"
    );
    expect(requests[0]?.init?.headers).toMatchObject({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    });
    expect(JSON.stringify(updates)).not.toContain("installation-secret");
  });
});

function connection(
  input: Partial<ExternalConnectionRecord> = {}
): ExternalConnectionRecord {
  return {
    id: "connection-1",
    tenantId: context().tenantId,
    userId: context().userId,
    provider: "GITHUB",
    accountEmail: "octo-user",
    scopes: [],
    encryptedAccessToken: encrypt(tokenKey, "token"),
    encryptedRefreshToken: null,
    expiresAt: new Date(Date.now() + 3600 * 1000),
    status: "CONNECTED",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...input
  };
}

function context(): {
  correlationId: string;
  tenantId: string;
  userId: string;
} {
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    correlationId: "test-correlation"
  };
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}
