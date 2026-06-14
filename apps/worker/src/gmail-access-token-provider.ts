import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";

import type {
  GmailConnectionRecord,
  PrismaExternalConnectionRepository
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

const googleTokenUrl = "https://oauth2.googleapis.com/token";

interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
}

export interface GmailAccessTokenProviderOptions {
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  connections: Pick<
    PrismaExternalConnectionRepository,
    "findGmail" | "updateGmailAccessToken"
  >;
  fetch?: typeof fetch;
  tokenEncryptionKey: string;
}

export class GmailAccessTokenProvider {
  private readonly request: typeof fetch;

  public constructor(
    private readonly options: GmailAccessTokenProviderOptions
  ) {
    this.request = options.fetch ?? fetch;
  }

  public async getAccessToken(context: TenantContext): Promise<string> {
    const connection = await this.options.connections.findGmail(context);
    if (!connection?.encryptedRefreshToken) {
      throw new Error("Gmail is not connected.");
    }
    if (hasUsableAccessToken(connection)) {
      return decrypt(
        this.options.tokenEncryptionKey,
        connection.encryptedAccessToken!
      );
    }
    return this.refreshAccessToken(context, connection);
  }

  private async refreshAccessToken(
    context: TenantContext,
    connection: GmailConnectionRecord
  ): Promise<string> {
    if (!this.options.clientId || !this.options.clientSecret) {
      throw new Error("Gmail OAuth refresh is not configured.");
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
    await this.options.connections.updateGmailAccessToken(context, {
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
  ): Promise<GoogleTokenResponse> {
    const response = await this.request(googleTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params)
    });
    if (!response.ok) {
      throw new Error("Google OAuth token refresh failed.");
    }
    return (await response.json()) as GoogleTokenResponse;
  }
}

export function encrypt(secret: string, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decrypt(secret: string, value: string): string {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Encrypted token payload is malformed.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(secret),
    Buffer.from(ivText, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function hasUsableAccessToken(connection: GmailConnectionRecord): boolean {
  return Boolean(
    connection.encryptedAccessToken &&
    connection.expiresAt &&
    connection.expiresAt.getTime() > Date.now() + 60_000
  );
}

function expiresAt(seconds: number | undefined): Date | null {
  return seconds ? new Date(Date.now() + seconds * 1000) : null;
}

function key(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}
