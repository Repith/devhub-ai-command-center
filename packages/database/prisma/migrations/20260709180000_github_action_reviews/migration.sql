CREATE TYPE "GithubActionReviewKind" AS ENUM (
  'ISSUE_COMMENT',
  'PULL_REQUEST_COMMENT',
  'ISSUE_CREATION'
);

CREATE TYPE "GithubActionReviewStatus" AS ENUM (
  'NEEDS_REVIEW',
  'UPDATED',
  'SENT',
  'REJECTED'
);

CREATE TABLE "GithubActionReview" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "repositoryId" UUID NOT NULL,
  "repositoryFullName" TEXT NOT NULL,
  "kind" "GithubActionReviewKind" NOT NULL,
  "issueNumber" INTEGER,
  "pullRequestNumber" INTEGER,
  "title" TEXT,
  "body" TEXT NOT NULL,
  "status" "GithubActionReviewStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
  "externalUrl" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "sentAt" TIMESTAMPTZ(3),

  CONSTRAINT "GithubActionReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GithubActionReview_tenantId_id_key"
  ON "GithubActionReview"("tenantId", "id");

CREATE INDEX "GithubActionReview_tenantId_userId_status_createdAt_idx"
  ON "GithubActionReview"("tenantId", "userId", "status", "createdAt" DESC);

CREATE INDEX "GithubActionReview_tenantId_repositoryId_idx"
  ON "GithubActionReview"("tenantId", "repositoryId");

CREATE INDEX "GithubActionReview_tenantId_repositoryFullName_idx"
  ON "GithubActionReview"("tenantId", "repositoryFullName");

ALTER TABLE "GithubActionReview"
  ADD CONSTRAINT "GithubActionReview_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GithubActionReview"
  ADD CONSTRAINT "GithubActionReview_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GithubActionReview"
  ADD CONSTRAINT "GithubActionReview_tenantId_repositoryId_fkey"
  FOREIGN KEY ("tenantId", "repositoryId")
  REFERENCES "ExternalRepository"("tenantId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
