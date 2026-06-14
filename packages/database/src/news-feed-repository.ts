import type {
  CreateNewsFeed,
  NewsFeed,
  NewsFeedFetchStatus,
  UpdateNewsFeed
} from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";

export interface NewsFeedRecord {
  id: string;
  tenantId: string;
  createdByUserId: string;
  name: string;
  url: string;
  topic: string | null;
  enabled: boolean;
  lastFetchedAt: Date | null;
  lastFetchStatus: NewsFeedFetchStatus;
  lastFetchItemCount: number | null;
  lastFetchErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface RecordNewsFeedFetchInput {
  status: Exclude<NewsFeedFetchStatus, "NEVER">;
  itemCount: number | null;
  errorCode: string | null;
}

export class PrismaNewsFeedRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public list(context: TenantContext): Promise<readonly NewsFeedRecord[]> {
    return this.database.tenantNewsFeed.findMany({
      where: { tenantId: context.tenantId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
  }

  public listEnabled(
    context: TenantContext,
    limit = 10
  ): Promise<readonly NewsFeedRecord[]> {
    return this.database.tenantNewsFeed.findMany({
      where: {
        tenantId: context.tenantId,
        enabled: true,
        deletedAt: null
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit
    });
  }

  public listByIds(
    context: TenantContext,
    ids: readonly string[]
  ): Promise<readonly NewsFeedRecord[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.database.tenantNewsFeed.findMany({
      where: {
        id: { in: [...ids] },
        tenantId: context.tenantId,
        deletedAt: null
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
  }

  public findById(
    context: TenantContext,
    id: string
  ): Promise<NewsFeedRecord | null> {
    return this.database.tenantNewsFeed.findFirst({
      where: { id, tenantId: context.tenantId, deletedAt: null }
    });
  }

  public create(
    context: TenantContext,
    input: CreateNewsFeed
  ): Promise<NewsFeedRecord> {
    return this.database.tenantNewsFeed.create({
      data: {
        tenantId: context.tenantId,
        createdByUserId: context.userId,
        name: input.name,
        url: input.url,
        topic: input.topic ?? null,
        enabled: input.enabled
      }
    });
  }

  public async update(
    context: TenantContext,
    id: string,
    input: UpdateNewsFeed
  ): Promise<NewsFeedRecord | null> {
    const result = await this.database.tenantNewsFeed.updateManyAndReturn({
      where: { id, tenantId: context.tenantId, deletedAt: null },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.topic !== undefined ? { topic: input.topic } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {})
      }
    });
    return result[0] ?? null;
  }

  public async delete(context: TenantContext, id: string): Promise<boolean> {
    const result = await this.database.tenantNewsFeed.updateMany({
      where: { id, tenantId: context.tenantId, deletedAt: null },
      data: { deletedAt: new Date(), enabled: false }
    });
    return result.count === 1;
  }

  public async recordFetch(
    context: TenantContext,
    id: string,
    input: RecordNewsFeedFetchInput
  ): Promise<void> {
    await this.database.tenantNewsFeed.updateMany({
      where: { id, tenantId: context.tenantId, deletedAt: null },
      data: {
        lastFetchedAt: new Date(),
        lastFetchStatus: input.status,
        lastFetchItemCount: input.itemCount,
        lastFetchErrorCode: input.errorCode
      }
    });
  }

  public toResponse(record: NewsFeedRecord): NewsFeed {
    return {
      id: record.id,
      name: record.name,
      url: record.url,
      topic: record.topic,
      enabled: record.enabled,
      lastFetchedAt: record.lastFetchedAt?.toISOString() ?? null,
      lastFetchStatus: record.lastFetchStatus,
      lastFetchItemCount: record.lastFetchItemCount,
      lastFetchErrorCode: record.lastFetchErrorCode,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }
}
