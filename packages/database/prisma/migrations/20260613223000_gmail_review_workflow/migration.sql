CREATE TYPE "ExternalConnectionProvider" AS ENUM ('GMAIL');

CREATE TYPE "ExternalConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'EXPIRED');

CREATE TYPE "GmailDraftReviewStatus" AS ENUM ('NEEDS_REVIEW', 'UPDATED', 'SENT', 'REJECTED');

CREATE TABLE "ExternalConnection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "ExternalConnectionProvider" NOT NULL,
    "accountEmail" TEXT,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "expiresAt" TIMESTAMPTZ(3),
    "status" "ExternalConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExternalConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GmailDraftReview" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "agentRunId" UUID,
    "threadId" TEXT,
    "gmailDraftId" TEXT,
    "to" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "GmailDraftReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "GmailDraftReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalConnection_tenantId_userId_provider_key" ON "ExternalConnection"("tenantId", "userId", "provider");
CREATE INDEX "ExternalConnection_tenantId_provider_status_idx" ON "ExternalConnection"("tenantId", "provider", "status");
CREATE INDEX "ExternalConnection_userId_provider_idx" ON "ExternalConnection"("userId", "provider");

CREATE UNIQUE INDEX "GmailDraftReview_tenantId_id_key" ON "GmailDraftReview"("tenantId", "id");
CREATE INDEX "GmailDraftReview_tenantId_userId_status_createdAt_idx" ON "GmailDraftReview"("tenantId", "userId", "status", "createdAt" DESC);
CREATE INDEX "GmailDraftReview_tenantId_agentRunId_idx" ON "GmailDraftReview"("tenantId", "agentRunId");
CREATE INDEX "GmailDraftReview_tenantId_threadId_idx" ON "GmailDraftReview"("tenantId", "threadId");

ALTER TABLE "ExternalConnection" ADD CONSTRAINT "ExternalConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalConnection" ADD CONSTRAINT "ExternalConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GmailDraftReview" ADD CONSTRAINT "GmailDraftReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GmailDraftReview" ADD CONSTRAINT "GmailDraftReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GmailDraftReview" ADD CONSTRAINT "GmailDraftReview_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
