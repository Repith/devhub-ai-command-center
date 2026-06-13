import { describe, expect, it } from "vitest";

import { toGmailRawMessage } from "../src/gmail-client";

describe("Gmail MIME helpers", () => {
  it("creates a base64url encoded plain text message without header injection", () => {
    const raw = toGmailRawMessage({
      to: ["client@example.com"],
      cc: ["lead@example.com"],
      subject: "Hello\r\nBcc: hidden@example.com",
      body: "Thanks for the update."
    });

    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: client@example.com");
    expect(decoded).toContain("Cc: lead@example.com");
    expect(decoded).toContain("Subject: Hello Bcc: hidden@example.com");
    expect(decoded).not.toContain("\r\nBcc:");
    expect(decoded).toContain("\r\n\r\nThanks for the update.");
  });
});
