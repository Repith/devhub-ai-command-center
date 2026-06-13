export interface GmailConfig {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  tokenEncryptionKey: string | null;
  autoSendAllowed: boolean;
  requiredScopes: readonly string[];
}

export function loadGmailConfig(): GmailConfig {
  return {
    clientId: process.env.GMAIL_CLIENT_ID ?? null,
    clientSecret: process.env.GMAIL_CLIENT_SECRET ?? null,
    redirectUri: process.env.GMAIL_REDIRECT_URI ?? null,
    tokenEncryptionKey: process.env.GMAIL_TOKEN_ENCRYPTION_KEY ?? null,
    autoSendAllowed: process.env.AUTO_SEND_ALLOWED === "true",
    requiredScopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose"
    ]
  };
}

export function isGmailConfigured(config: GmailConfig): boolean {
  return Boolean(
    config.clientId &&
    config.clientSecret &&
    config.redirectUri &&
    config.tokenEncryptionKey
  );
}
