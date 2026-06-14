import type { GmailDraftReviewRecord } from "@devhub/database";
import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, expect, it } from "vitest";

import { GmailService } from "../src/gmail/gmail.service";
import { GmailOAuthStateService } from "../src/gmail/oauth-state.service";
import { TokenCryptoService } from "../src/gmail/token-crypto.service";
import type { RequestPrincipal } from "../src/auth/auth.types";

describe("Gmail security helpers", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

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

  it("requires a connected Gmail account before sending a draft review", async () => {
    process.env.GMAIL_CLIENT_ID = "client-id";
    process.env.GMAIL_CLIENT_SECRET = "client-secret";
    process.env.GMAIL_REDIRECT_URI = "http://localhost/callback";
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = "local-test-encryption-key";
    const service = gmailService({
      connections: { findGmail: () => Promise.resolve(null) },
      draftReviews: {
        findById: () => Promise.resolve(gmailDraftReviewRecord())
      }
    });

    await expect(
      service.sendDraftReview(principal(), gmailDraftReviewRecord().id)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("audits draft review metadata without message body content", async () => {
    const audit = { records: [] as unknown[] };
    const service = gmailService({
      audit,
      draftReviews: {
        reject: () =>
          Promise.resolve(
            gmailDraftReviewRecord({ body: "SECRET_BODY should not audit." })
          )
      }
    });

    await service.rejectDraftReview(principal(), gmailDraftReviewRecord().id);

    expect(JSON.stringify(audit.records)).not.toContain("SECRET_BODY");
    expect(audit.records).toEqual([
      expect.objectContaining({
        action: "gmail.draft_review.rejected",
        metadata: expect.objectContaining({
          recipientCount: 1,
          ccCount: 0,
          hasThread: true
        })
      })
    ]);
  });
});

function gmailService(options: {
  audit?: { records: unknown[] };
  connections?: { findGmail(): Promise<null> };
  draftReviews?: {
    findById?(): Promise<GmailDraftReviewRecord | null>;
    reject?(): Promise<GmailDraftReviewRecord | null>;
  };
}): GmailService {
  const audit = options.audit ?? { records: [] as unknown[] };
  return new GmailService(
    {
      findGmail: options.connections?.findGmail ?? (() => Promise.resolve(null))
    } as never,
    {
      findById:
        options.draftReviews?.findById ??
        (() => Promise.resolve(gmailDraftReviewRecord())),
      reject:
        options.draftReviews?.reject ??
        (() => Promise.resolve(gmailDraftReviewRecord()))
    } as never,
    {
      record: (_principal: unknown, entry: unknown) => {
        audit.records.push(entry);
        return Promise.resolve();
      }
    } as never,
    new TokenCryptoService(),
    new GmailOAuthStateService()
  );
}

function principal(): RequestPrincipal {
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    sessionId: "session-test",
    role: "OWNER",
    email: "owner@example.com",
    displayName: "Owner",
    tenantName: "Tenant",
    tenantSlug: "tenant"
  };
}

function gmailDraftReviewRecord(
  input: Partial<GmailDraftReviewRecord> = {}
): GmailDraftReviewRecord {
  const now = new Date();
  return {
    id: "00000000-0000-4000-8000-000000000101",
    tenantId: principal().tenantId,
    userId: principal().userId,
    agentRunId: null,
    threadId: "thread-1",
    gmailDraftId: "draft-1",
    to: ["client@example.com"],
    cc: [],
    subject: "Re: Update",
    body: "Thanks for the note.",
    status: "NEEDS_REVIEW",
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    ...input
  };
}
