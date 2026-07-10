import { describe, expect, it, vi } from "vitest";

import { PrismaGithubActionReviewRepository } from "../src/github-action-review-repository";

describe("PrismaGithubActionReviewRepository", () => {
  it("keeps updates tenant/user scoped and terminal reviews immutable", async () => {
    const calls: unknown[] = [];
    const repository = new PrismaGithubActionReviewRepository({
      githubActionReview: {
        updateManyAndReturn: vi.fn((input: unknown) => {
          calls.push(input);
          return Promise.resolve([]);
        })
      }
    } as never);

    await repository.update(context(), reviewId, { body: "Updated" });
    await repository.reject(context(), reviewId);
    await repository.markSent(context(), reviewId, {
      externalUrl: "https://github.com/octo-org/hello-world/issues/7#comment-1"
    });

    expect(calls).toEqual([
      expect.objectContaining({ where: mutableWhere() }),
      expect.objectContaining({ where: mutableWhere() }),
      expect.objectContaining({ where: mutableWhere() })
    ]);
  });
});

const reviewId = "00000000-0000-4000-8000-000000000601";

function context(): {
  correlationId: string;
  tenantId: string;
  userId: string;
} {
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    correlationId: "test"
  };
}

function mutableWhere(): {
  id: string;
  status: { in: ["NEEDS_REVIEW", "UPDATED"] };
  tenantId: string;
  userId: string;
} {
  return {
    id: reviewId,
    tenantId: context().tenantId,
    userId: context().userId,
    status: { in: ["NEEDS_REVIEW", "UPDATED"] }
  };
}
