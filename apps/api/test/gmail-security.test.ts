import { describe, expect, it } from "vitest";

import { GmailOAuthStateService } from "../src/gmail/oauth-state.service";
import { TokenCryptoService } from "../src/gmail/token-crypto.service";

describe("Gmail security helpers", () => {
  it("encrypts refresh tokens without leaving plaintext in storage", () => {
    const crypto = new TokenCryptoService();
    const encrypted = crypto.encrypt(
      "local-test-encryption-key",
      "refresh-token-secret"
    );

    expect(encrypted).not.toContain("refresh-token-secret");
    expect(crypto.decrypt("local-test-encryption-key", encrypted)).toBe(
      "refresh-token-secret"
    );
  });

  it("binds OAuth state to the active tenant and user", () => {
    const states = new GmailOAuthStateService();
    const state = states.sign("state-secret", "tenant-1", "user-1");

    expect(() =>
      states.verify("state-secret", state, "tenant-1", "user-1")
    ).not.toThrow();
    expect(() =>
      states.verify("state-secret", state, "tenant-2", "user-1")
    ).toThrow("OAuth state does not match the active principal.");
  });
});
