import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {
  CreateNewsFeed,
  NewsFeed,
  NewsFeedList,
  UpdateNewsFeed
} from "@devhub/contracts";
import type { PrismaNewsFeedRepository } from "@devhub/database";
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
    const record = await this.feeds.create(this.context(principal), input);
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
    const record = await this.feeds.update(
      this.context(principal),
      feedId,
      input
    );
    if (!record) {
      throw new NotFoundException("News feed was not found.");
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
      throw new NotFoundException("News feed was not found.");
    }
    await this.audit.record(principal, {
      action: "news_feed.deleted",
      resourceType: "news_feed",
      resourceId: feedId
    });
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }
}
