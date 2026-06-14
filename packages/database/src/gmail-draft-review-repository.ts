import type {
  CreateGmailDraftReview,
  GmailDraftReviewStatus,
  UpdateGmailDraftReview
} from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";

export interface GmailDraftReviewRecord {
  id: string;
  tenantId: string;
  userId: string;
  agentRunId: string | null;
  threadId: string | null;
  gmailDraftId: string | null;
  to: readonly string[];
  cc: readonly string[];
  subject: string;
  body: string;
  status: GmailDraftReviewStatus;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
}

export interface MarkGmailDraftSentInput {
  gmailDraftId: string;
  threadId: string | null;
}

export interface CreateGmailDraftReviewRecordInput extends CreateGmailDraftReview {
  agentRunId?: string;
}

export class PrismaGmailDraftReviewRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public list(
    context: TenantContext
  ): Promise<readonly GmailDraftReviewRecord[]> {
    return this.database.gmailDraftReview.findMany({
      where: {
        tenantId: context.tenantId,
        userId: context.userId
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 100
    });
  }

  public findById(
    context: TenantContext,
    id: string
  ): Promise<GmailDraftReviewRecord | null> {
    return this.database.gmailDraftReview.findFirst({
      where: {
        id,
        tenantId: context.tenantId,
        userId: context.userId
      }
    });
  }

  public create(
    context: TenantContext,
    input: CreateGmailDraftReviewRecordInput
  ): Promise<GmailDraftReviewRecord> {
    return this.database.$transaction(async (transaction) => {
      if (input.agentRunId) {
        const agentRun = await transaction.agentRun.findUnique({
          where: {
            tenantId_id: {
              tenantId: context.tenantId,
              id: input.agentRunId
            }
          },
          select: { id: true }
        });
        if (!agentRun) {
          throw new Error("Agent run was not found for this tenant.");
        }
      }
      return transaction.gmailDraftReview.create({
        data: {
          tenantId: context.tenantId,
          userId: context.userId,
          agentRunId: input.agentRunId ?? null,
          threadId: input.threadId ?? null,
          gmailDraftId: input.gmailDraftId ?? null,
          to: [...input.to],
          cc: [...input.cc],
          subject: input.subject,
          body: input.body,
          status: "NEEDS_REVIEW"
        }
      });
    });
  }

  public createUserReview(
    context: TenantContext,
    input: CreateGmailDraftReview
  ): Promise<GmailDraftReviewRecord> {
    return this.database.gmailDraftReview.create({
      data: {
        tenantId: context.tenantId,
        userId: context.userId,
        agentRunId: null,
        threadId: input.threadId ?? null,
        gmailDraftId: input.gmailDraftId ?? null,
        to: [...input.to],
        cc: [...input.cc],
        subject: input.subject,
        body: input.body,
        status: "NEEDS_REVIEW"
      }
    });
  }

  public async update(
    context: TenantContext,
    id: string,
    input: UpdateGmailDraftReview
  ): Promise<GmailDraftReviewRecord | null> {
    const result = await this.database.gmailDraftReview.updateManyAndReturn({
      where: {
        id,
        tenantId: context.tenantId,
        userId: context.userId,
        status: { in: ["NEEDS_REVIEW", "UPDATED"] }
      },
      data: {
        ...(input.to !== undefined ? { to: [...input.to] } : {}),
        ...(input.cc !== undefined ? { cc: [...input.cc] } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        status: "UPDATED"
      }
    });
    return result[0] ?? null;
  }

  public async reject(
    context: TenantContext,
    id: string
  ): Promise<GmailDraftReviewRecord | null> {
    const result = await this.database.gmailDraftReview.updateManyAndReturn({
      where: {
        id,
        tenantId: context.tenantId,
        userId: context.userId,
        status: { in: ["NEEDS_REVIEW", "UPDATED"] }
      },
      data: { status: "REJECTED" }
    });
    return result[0] ?? null;
  }

  public async markSent(
    context: TenantContext,
    id: string,
    input: MarkGmailDraftSentInput
  ): Promise<GmailDraftReviewRecord | null> {
    const result = await this.database.gmailDraftReview.updateManyAndReturn({
      where: {
        id,
        tenantId: context.tenantId,
        userId: context.userId,
        status: { in: ["NEEDS_REVIEW", "UPDATED"] }
      },
      data: {
        gmailDraftId: input.gmailDraftId,
        threadId: input.threadId,
        status: "SENT",
        sentAt: new Date()
      }
    });
    return result[0] ?? null;
  }
}
