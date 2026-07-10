import type {
  CreateGithubActionReview,
  GithubActionReviewKind,
  GithubActionReviewStatus,
  UpdateGithubActionReview
} from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";
import type { ExternalRepositoryRecord } from "./external-installation-repository.js";

export interface GithubActionReviewRecord {
  id: string;
  tenantId: string;
  userId: string;
  repositoryId: string;
  repositoryFullName: string;
  kind: GithubActionReviewKind;
  issueNumber: number | null;
  pullRequestNumber: number | null;
  title: string | null;
  body: string;
  status: GithubActionReviewStatus;
  externalUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

export interface CreateGithubActionReviewRecordInput extends CreateGithubActionReview {
  repository: ExternalRepositoryRecord;
}

export interface MarkGithubActionSentInput {
  externalUrl: string;
}

export class PrismaGithubActionReviewRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public list(
    context: TenantContext
  ): Promise<readonly GithubActionReviewRecord[]> {
    return this.database.githubActionReview.findMany({
      where: { tenantId: context.tenantId, userId: context.userId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100
    });
  }

  public findById(
    context: TenantContext,
    id: string
  ): Promise<GithubActionReviewRecord | null> {
    return this.database.githubActionReview.findFirst({
      where: { id, tenantId: context.tenantId, userId: context.userId }
    });
  }

  public create(
    context: TenantContext,
    input: CreateGithubActionReviewRecordInput
  ): Promise<GithubActionReviewRecord> {
    return this.database.githubActionReview.create({
      data: {
        tenantId: context.tenantId,
        userId: context.userId,
        repositoryId: input.repository.id,
        repositoryFullName: input.repository.fullName,
        kind: input.kind,
        issueNumber: input.issueNumber ?? null,
        pullRequestNumber: input.pullRequestNumber ?? null,
        title: input.title ?? null,
        body: input.body,
        status: "NEEDS_REVIEW"
      }
    });
  }

  public async update(
    context: TenantContext,
    id: string,
    input: UpdateGithubActionReview
  ): Promise<GithubActionReviewRecord | null> {
    const result = await this.database.githubActionReview.updateManyAndReturn({
      where: mutableReviewWhere(context, id),
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        status: "UPDATED"
      }
    });
    return result[0] ?? null;
  }

  public async reject(
    context: TenantContext,
    id: string
  ): Promise<GithubActionReviewRecord | null> {
    const result = await this.database.githubActionReview.updateManyAndReturn({
      where: mutableReviewWhere(context, id),
      data: { status: "REJECTED" }
    });
    return result[0] ?? null;
  }

  public async markSent(
    context: TenantContext,
    id: string,
    input: MarkGithubActionSentInput
  ): Promise<GithubActionReviewRecord | null> {
    const result = await this.database.githubActionReview.updateManyAndReturn({
      where: mutableReviewWhere(context, id),
      data: {
        externalUrl: input.externalUrl,
        status: "SENT",
        sentAt: new Date()
      }
    });
    return result[0] ?? null;
  }
}

function mutableReviewWhere(
  context: TenantContext,
  id: string
): {
  id: string;
  status: { in: ["NEEDS_REVIEW", "UPDATED"] };
  tenantId: string;
  userId: string;
} {
  return {
    id,
    tenantId: context.tenantId,
    userId: context.userId,
    status: { in: ["NEEDS_REVIEW", "UPDATED"] }
  };
}
