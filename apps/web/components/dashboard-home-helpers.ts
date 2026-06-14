import type { Document, GmailDraftReview } from "@devhub/contracts";

export interface DocumentSummary {
  total: number;
  indexed: number;
  processing: number;
  failed: number;
}

export function summarizeDocuments(
  documents: readonly Document[]
): DocumentSummary {
  return documents.reduce<DocumentSummary>(
    (summary, document) => ({
      total: summary.total + 1,
      indexed: summary.indexed + (document.status === "INDEXED" ? 1 : 0),
      processing:
        summary.processing +
        (["UPLOADED", "PROCESSING"].includes(document.status) ? 1 : 0),
      failed: summary.failed + (document.status === "FAILED" ? 1 : 0)
    }),
    { total: 0, indexed: 0, processing: 0, failed: 0 }
  );
}

export function pendingDraftReviews(
  reviews: readonly GmailDraftReview[]
): GmailDraftReview[] {
  return reviews.filter((review) =>
    ["NEEDS_REVIEW", "UPDATED"].includes(review.status)
  );
}
