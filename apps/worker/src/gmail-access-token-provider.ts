import type {
  GmailConnectionRecord,
  PrismaExternalConnectionRepository
} from "@devhub/database";
import { tokenCrypto } from "@devhub/database";
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
  return tokenCrypto.encrypt(secret, value);
}

export function decrypt(secret: string, value: string): string {
  return tokenCrypto.decrypt(secret, value);
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
