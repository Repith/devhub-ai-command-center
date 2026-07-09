export interface GithubConfig {
  appId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  privateKey: string | null;
  webhookSecret: string | null;
  redirectUri: string | null;
  tokenEncryptionKey: string | null;
}

export function loadGithubConfig(): GithubConfig {
  return {
    appId: process.env.GITHUB_APP_ID ?? null,
    clientId: process.env.GITHUB_CLIENT_ID ?? null,
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? null,
    privateKey: process.env.GITHUB_PRIVATE_KEY ?? null,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? null,
    redirectUri: process.env.GITHUB_REDIRECT_URI ?? null,
    tokenEncryptionKey: process.env.GITHUB_TOKEN_ENCRYPTION_KEY ?? null
  };
}

export function isGithubConfigured(config: GithubConfig): boolean {
  return missingGithubConfigKeys(config).length === 0;
}

export function missingGithubConfigKeys(config: GithubConfig): string[] {
  const missing: string[] = [];
  if (!config.appId) {
    missing.push("GITHUB_APP_ID");
  }
  if (!config.clientId) {
    missing.push("GITHUB_CLIENT_ID");
  }
  if (!config.clientSecret) {
    missing.push("GITHUB_CLIENT_SECRET");
  }
  if (!config.privateKey) {
    missing.push("GITHUB_PRIVATE_KEY");
  }
  if (!config.webhookSecret) {
    missing.push("GITHUB_WEBHOOK_SECRET");
  }
  if (!config.redirectUri) {
    missing.push("GITHUB_REDIRECT_URI");
  }
  if (!config.tokenEncryptionKey) {
    missing.push("GITHUB_TOKEN_ENCRYPTION_KEY");
  }
  return missing;
}
