import { describe, expect, it } from "vitest";

import type { Document, GmailDraftReview } from "@devhub/contracts";

import {
  pendingDraftReviews,
  summarizeDocuments
} from "../components/dashboard-home-helpers";

describe("DashboardHome helpers", () => {
  it("summarizes knowledge source states for the home widget", () => {
    expect(
      summarizeDocuments([
        document("INDEXED"),
        document("PROCESSING"),
        document("UPLOADED"),
        document("FAILED")
      ])
    ).toEqual({
      total: 4,
      indexed: 1,
      processing: 2,
      failed: 1
    });
  });

  it("keeps only Gmail drafts that need user review", () => {
    expect(
      pendingDraftReviews([
        review("NEEDS_REVIEW"),
        review("UPDATED"),
        review("SENT"),
        review("REJECTED")
      ]).map((item) => item.status)
    ).toEqual(["NEEDS_REVIEW", "UPDATED"]);
  });
});

function document(status: Document["status"]): Document {
  return {
    id: crypto.randomUUID(),
    fileName: "notes.md",
    mimeType: "text/markdown",
    sizeBytes: 12,
    checksum: "checksum",
    status,
    failureCode: null,
    failureDetail: null,
    chunkCount: status === "INDEXED" ? 3 : 0,
    createdAt: "2026-06-09T12:00:00.000Z",
    updatedAt: "2026-06-09T12:00:00.000Z"
  };
}

function review(status: GmailDraftReview["status"]): GmailDraftReview {
  return {
    id: crypto.randomUUID(),
    agentRunId: null,
    threadId: "thread-1",
    gmailDraftId: "draft-1",
    to: ["client@example.com"],
    cc: [],
    subject: "Re: Update",
    body: "Thanks for the note.",
    status,
    createdAt: "2026-06-09T12:00:00.000Z",
    updatedAt: "2026-06-09T12:00:00.000Z",
    sentAt: null
  };
}
