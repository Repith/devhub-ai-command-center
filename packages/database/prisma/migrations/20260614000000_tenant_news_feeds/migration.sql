CREATE TYPE "NewsFeedFetchStatus" AS ENUM ('NEVER', 'COMPLETED', 'FAILED');

CREATE TABLE "TenantNewsFeed" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "topic" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMPTZ(3),
    "lastFetchStatus" "NewsFeedFetchStatus" NOT NULL DEFAULT 'NEVER',
    "lastFetchItemCount" INTEGER,
    "lastFetchErrorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TenantNewsFeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantNewsFeed_tenantId_id_key" ON "TenantNewsFeed"("tenantId", "id");
CREATE UNIQUE INDEX "TenantNewsFeed_tenantId_url_key" ON "TenantNewsFeed"("tenantId", "url");
CREATE INDEX "TenantNewsFeed_tenantId_enabled_deletedAt_idx" ON "TenantNewsFeed"("tenantId", "enabled", "deletedAt");
CREATE INDEX "TenantNewsFeed_tenantId_topic_idx" ON "TenantNewsFeed"("tenantId", "topic");

ALTER TABLE "TenantNewsFeed" ADD CONSTRAINT "TenantNewsFeed_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantNewsFeed" ADD CONSTRAINT "TenantNewsFeed_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
