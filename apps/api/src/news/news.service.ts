import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type {
  CreateNewsFeed,
  NewsFeed,
  NewsFeedList,
  NewsFeedRefreshResponse,
  UpdateNewsFeed
} from "@devhub/contracts";
import { createNewsFetchRssTool } from "@devhub/mcp";
import {
  NewsFeedAlreadyExistsError,
  type NewsFeedRecord,
  type PrismaNewsFeedRepository
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { NEWS_FEED_REPOSITORY } from "./news.tokens";

@Injectable()
export class NewsService {
  public constructor(
    @Inject(NEWS_FEED_REPOSITORY)
    private readonly feeds: PrismaNewsFeedRepository,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  public async list(principal: RequestPrincipal): Promise<NewsFeedList> {
    const records = await this.feeds.list(this.context(principal));
    return {
      data: records.map((record) => this.feeds.toResponse(record)),
      page: { cursor: null, nextCursor: null, limit: 100 }
    };
  }

  public async create(
    principal: RequestPrincipal,
    input: CreateNewsFeed
  ): Promise<NewsFeed> {
    const record = await this.createFeed(principal, input);
    await this.audit.record(principal, {
      action: "news_feed.created",
      resourceType: "news_feed",
      resourceId: record.id,
      metadata: {
        enabled: record.enabled,
        topic: record.topic,
        urlHost: new URL(record.url).host
      }
    });
    return this.feeds.toResponse(record);
  }

  public async update(
    principal: RequestPrincipal,
    feedId: string,
    input: UpdateNewsFeed
  ): Promise<NewsFeed> {
    const record = await this.updateFeed(principal, feedId, input);
    if (!record) {
      throw newsFeedNotFound();
    }
    await this.audit.record(principal, {
      action: "news_feed.updated",
      resourceType: "news_feed",
      resourceId: record.id,
      metadata: { fields: Object.keys(input).sort() }
    });
    return this.feeds.toResponse(record);
  }

  public async delete(
    principal: RequestPrincipal,
    feedId: string
  ): Promise<void> {
    const deleted = await this.feeds.delete(this.context(principal), feedId);
    if (!deleted) {
      throw newsFeedNotFound();
    }
    await this.audit.record(principal, {
      action: "news_feed.deleted",
      resourceType: "news_feed",
      resourceId: feedId
    });
  }

  public async refresh(
    principal: RequestPrincipal
  ): Promise<NewsFeedRefreshResponse> {
    const context = this.context(principal);
    const feeds = await this.feeds.listEnabled(context, 10);
    const tool = createNewsFetchRssTool({
      timeoutMs: Number(process.env.RSS_TOOL_TIMEOUT_MS ?? 10_000)
    });
    const results = await Promise.all(
      feeds.map(async (feed) => {
        try {
          const output = await tool.execute(
            { url: feed.url, limit: 20 },
            context
          );
          await this.feeds.recordFetch(context, feed.id, {
            status: "COMPLETED",
            itemCount: output.items.length,
            errorCode: null
          });
          return {
            failed: false,
            items: output.items.map((item) => ({
              feedId: feed.id,
              feedName: feed.name,
              title: item.title.slice(0, 500),
              url: item.url,
              publishedAt: item.publishedAt,
              summary: item.summary.slice(0, 4000)
            }))
          };
        } catch {
          await this.feeds.recordFetch(context, feed.id, {
            status: "FAILED",
            itemCount: null,
            errorCode: "NEWS_FEED_FETCH_FAILED"
          });
          return { failed: true, items: [] };
        }
      })
    );
    const failedFeedCount = results.filter((result) => result.failed).length;
    await this.audit.record(principal, {
      action: "news_feeds.refreshed",
      resourceType: "news_feed",
      metadata: { feedCount: feeds.length, failedCount: failedFeedCount }
    });
    return {
      items: results.flatMap((result) => result.items).slice(0, 200),
      fetchedFeedCount: results.length - failedFeedCount,
      failedFeedCount
    };
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }

  private async createFeed(
    principal: RequestPrincipal,
    input: CreateNewsFeed
  ): Promise<NewsFeedRecord> {
    try {
      return await this.feeds.create(this.context(principal), input);
    } catch (error) {
      throw mapNewsFeedError(error);
    }
  }

  private async updateFeed(
    principal: RequestPrincipal,
    feedId: string,
    input: UpdateNewsFeed
  ): Promise<NewsFeedRecord | null> {
    try {
      return await this.feeds.update(this.context(principal), feedId, input);
    } catch (error) {
      throw mapNewsFeedError(error);
    }
  }
}

function mapNewsFeedError(error: unknown): Error {
  if (error instanceof NewsFeedAlreadyExistsError) {
    return new ConflictException({
      code: "NEWS_FEED_ALREADY_EXISTS",
      message: "A news feed with this URL already exists."
    });
  }
  return error instanceof Error
    ? error
    : new Error("News feed request failed.");
}

function newsFeedNotFound(): NotFoundException {
  return new NotFoundException({
    code: "NEWS_FEED_NOT_FOUND",
    message: "News feed was not found."
  });
}
