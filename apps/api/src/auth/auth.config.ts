export interface AuthConfig {
  jwtSecret: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  refreshCookieSecure: boolean;
}

export const AUTH_CONFIG = Symbol("AUTH_CONFIG");
export const REFRESH_COOKIE_NAME = "devhub_refresh";

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function loadAuthConfig(): AuthConfig {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  }

  return {
    jwtSecret,
    issuer: process.env.JWT_ISSUER ?? "devhub-ai-command-center",
    audience: process.env.JWT_AUDIENCE ?? "devhub-api",
    accessTokenTtlSeconds: positiveInteger("ACCESS_TOKEN_TTL_SECONDS", 900),
    refreshTokenTtlSeconds: positiveInteger(
      "REFRESH_TOKEN_TTL_SECONDS",
      2_592_000
    ),
    refreshCookieSecure: process.env.REFRESH_COOKIE_SECURE === "true"
  };
}
