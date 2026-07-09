export interface GmailConfig {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  tokenEncryptionKey: string | null;
  autoSendAllowed: boolean;
  devMockEnabled: boolean;
  requiredScopes: readonly string[];
}

export function loadGmailConfig(): GmailConfig {
  return {
    clientId: process.env.GMAIL_CLIENT_ID ?? null,
    clientSecret: process.env.GMAIL_CLIENT_SECRET ?? null,
    redirectUri: process.env.GMAIL_REDIRECT_URI ?? null,
    tokenEncryptionKey: process.env.GMAIL_TOKEN_ENCRYPTION_KEY ?? null,
    autoSendAllowed: process.env.AUTO_SEND_ALLOWED === "true",
    devMockEnabled: process.env.GMAIL_DEV_MOCK_ENABLED === "true",
    requiredScopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose"
    ]
  };
}

export function isGmailConfigured(config: GmailConfig): boolean {
  return missingGmailConfigKeys(config).length === 0;
}

export function missingGmailConfigKeys(config: GmailConfig): string[] {
  const missing: string[] = [];
  if (!config.clientId) {
    missing.push("GMAIL_CLIENT_ID");
  }
  if (!config.clientSecret) {
    missing.push("GMAIL_CLIENT_SECRET");
  }
  if (!config.redirectUri) {
    missing.push("GMAIL_REDIRECT_URI");
  }
  if (!config.tokenEncryptionKey) {
    missing.push("GMAIL_TOKEN_ENCRYPTION_KEY");
  }
  return missing;
}

export function canUseGmailDevMock(config: GmailConfig): boolean {
  return Boolean(config.devMockEnabled && config.tokenEncryptionKey);
}
