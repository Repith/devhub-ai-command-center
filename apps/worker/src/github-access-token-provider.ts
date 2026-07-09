import { createSign } from "node:crypto";

import type {
  ExternalConnectionRecord,
  PrismaExternalConnectionRepository
} from "@devhub/database";
import { tokenCrypto } from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

const githubTokenUrl = "https://github.com/login/oauth/access_token";
const githubApiUrl = "https://api.github.com";

interface GithubTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

interface GithubInstallationTokenResponse {
  token: string;
}

export interface GithubRepositoryAuthorization {
  providerInstallationId?: string;
}

export interface GithubAccessTokenProviderOptions {
  appId?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  connections: Pick<
    PrismaExternalConnectionRepository,
    "find" | "updateAccessToken"
  >;
  fetch?: typeof fetch;
  privateKey?: string | undefined;
  tokenEncryptionKey: string;
}

export class GithubAccessTokenProvider {
  private readonly request: typeof fetch;

  public constructor(
    private readonly options: GithubAccessTokenProviderOptions
  ) {
    this.request = options.fetch ?? fetch;
  }

  public async getAccessToken(
    context: TenantContext,
    authorization?: GithubRepositoryAuthorization
  ): Promise<string> {
    if (
      authorization?.providerInstallationId &&
      this.options.appId &&
      this.options.privateKey
    ) {
      return this.createInstallationAccessToken(
        authorization.providerInstallationId
      );
    }
    return this.getUserAccessToken(context);
  }

  private async getUserAccessToken(context: TenantContext): Promise<string> {
    const connection = await this.options.connections.find(context, "GITHUB");
    if (!connection?.encryptedAccessToken) {
      throw new Error("GitHub is not connected.");
    }
    if (hasUsableAccessToken(connection)) {
      return decrypt(
        this.options.tokenEncryptionKey,
        connection.encryptedAccessToken
      );
    }
    if (!connection.encryptedRefreshToken) {
      throw new Error("GitHub connection is expired.");
    }
    return this.refreshAccessToken(context, connection);
  }

  private async createInstallationAccessToken(
    providerInstallationId: string
  ): Promise<string> {
    const response = await this.request(
      `${githubApiUrl}/app/installations/${providerInstallationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${createGithubAppJwt(
            this.options.appId!,
            this.options.privateKey!
          )}`,
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }
    );
    if (!response.ok) {
      throw new Error("GitHub installation token request failed.");
    }
    const token = (await response.json()) as GithubInstallationTokenResponse;
    if (!token.token) {
      throw new Error("GitHub installation token response was invalid.");
    }
    return token.token;
  }

  private async refreshAccessToken(
    context: TenantContext,
    connection: ExternalConnectionRecord
  ): Promise<string> {
    if (!this.options.clientId || !this.options.clientSecret) {
      throw new Error("GitHub OAuth refresh is not configured.");
    }
    const token = await this.tokenRequest({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      grant_type: "refresh_token",
      refresh_token: decrypt(
        this.options.tokenEncryptionKey,
        connection.encryptedRefreshToken!
      )
    });
    await this.options.connections.updateAccessToken(context, "GITHUB", {
      encryptedAccessToken: encrypt(
        this.options.tokenEncryptionKey,
        token.access_token
      ),
      expiresAt: expiresAt(token.expires_in),
      status: "CONNECTED"
    });
    return token.access_token;
  }

  private async tokenRequest(
    params: Record<string, string>
  ): Promise<GithubTokenResponse> {
    const response = await this.request(githubTokenUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(params)
    });
    if (!response.ok) {
      throw new Error("GitHub OAuth token refresh failed.");
    }
    return (await response.json()) as GithubTokenResponse;
  }
}

export function encrypt(secret: string, value: string): string {
  return tokenCrypto.encrypt(secret, value);
}

export function decrypt(secret: string, value: string): string {
  return tokenCrypto.decrypt(secret, value);
}

function hasUsableAccessToken(connection: ExternalConnectionRecord): boolean {
  return Boolean(
    connection.encryptedAccessToken &&
    (!connection.expiresAt ||
      connection.expiresAt.getTime() > Date.now() + 60_000)
  );
}

function expiresAt(seconds: number | undefined): Date | null {
  return seconds ? new Date(Date.now() + seconds * 1000) : null;
}

function createGithubAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iat: now - 60,
    exp: now + 540,
    iss: appId
  });
  const input = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(input)
    .sign(normalizePrivateKey(privateKey), "base64url");
  return `${input}.${signature}`;
}

function base64UrlJson(value: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}
