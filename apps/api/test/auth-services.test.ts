import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";

import type { AuthConfig } from "../src/auth/auth.config";
import { PasswordService } from "../src/auth/password.service";
import { TokenService } from "../src/auth/token.service";

const config: AuthConfig = {
  jwtSecret: "unit-test-secret-with-at-least-32-characters",
  issuer: "devhub-ai-command-center",
  audience: "devhub-api",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
  refreshCookieSecure: false
};

describe("authentication services", () => {
  it("hashes and verifies passwords with Argon2id", async () => {
    const passwords = new PasswordService();
    const hash = await passwords.hash("correct horse battery staple");

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      passwords.verify(hash, "correct horse battery staple")
    ).resolves.toBe(true);
    await expect(passwords.verify(hash, "wrong password")).resolves.toBe(false);
  });

  it("issues verifiable tenant-scoped access tokens", async () => {
    const tokens = new TokenService(new JwtService(), config);
    const response = await tokens.issueAccessToken(
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
      "OWNER",
      "30000000-0000-4000-8000-000000000001"
    );
    const claims = await tokens.verifyAccessToken(response.accessToken);

    expect(claims).toMatchObject({
      sub: "10000000-0000-4000-8000-000000000001",
      tenantId: "20000000-0000-4000-8000-000000000001",
      role: "OWNER",
      sessionId: "30000000-0000-4000-8000-000000000001"
    });
  });

  it("stores refresh tokens through deterministic hashes", () => {
    const tokens = new TokenService(new JwtService(), config);
    const refresh = tokens.createRefreshToken();

    expect(refresh.token).not.toContain(refresh.tokenHash);
    expect(tokens.matchesRefreshToken(refresh.token, refresh.tokenHash)).toBe(
      true
    );
    expect(
      tokens.matchesRefreshToken(`${refresh.token}x`, refresh.tokenHash)
    ).toBe(false);
  });
});
