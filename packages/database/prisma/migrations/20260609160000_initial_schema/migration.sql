-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'INDEXED', 'FAILED', 'DELETING');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "RunStepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDefinition" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "maxSteps" INTEGER NOT NULL DEFAULT 8,
    "maxToolCalls" INTEGER NOT NULL DEFAULT 4,
    "maxTokens" INTEGER,
    "timeoutMs" INTEGER NOT NULL DEFAULT 120000,
    "enabledToolIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "knowledgeBaseIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AgentDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "failureCode" TEXT,
    "failureDetail" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "pageNumber" INTEGER,
    "vectorId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "conversationId" UUID,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "configSnapshot" JSONB NOT NULL,
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunStep" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentRunId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "RunStepStatus" NOT NULL DEFAULT 'PENDING',
    "inputPreview" TEXT,
    "outputPreview" TEXT,
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AgentRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentRunId" UUID NOT NULL,
    "runStepId" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costMicros" BIGINT NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldenCase" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "expectedFacts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "forbiddenClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expectedSources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "GoldenCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationRun" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'QUEUED',
    "configVersion" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationResult" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "evaluationRunId" UUID NOT NULL,
    "goldenCaseId" UUID NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "details" JSONB NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "retrievalHit" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_tenantId_userId_key" ON "Membership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "AgentDefinition_tenantId_deletedAt_idx" ON "AgentDefinition"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDefinition_tenantId_id_key" ON "AgentDefinition"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_updatedAt_idx" ON "Conversation"("tenantId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_tenantId_id_key" ON "Conversation"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Message_tenantId_conversationId_createdAt_idx" ON "Message"("tenantId", "conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_tenantId_conversationId_sequence_key" ON "Message"("tenantId", "conversationId", "sequence");

-- CreateIndex
CREATE INDEX "Document_tenantId_status_createdAt_idx" ON "Document"("tenantId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Document_tenantId_id_key" ON "Document"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Document_tenantId_storageKey_key" ON "Document"("tenantId", "storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_vectorId_key" ON "DocumentChunk"("vectorId");

-- CreateIndex
CREATE INDEX "DocumentChunk_tenantId_documentId_idx" ON "DocumentChunk"("tenantId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_tenantId_documentId_ordinal_key" ON "DocumentChunk"("tenantId", "documentId", "ordinal");

-- CreateIndex
CREATE INDEX "AgentRun_tenantId_status_createdAt_idx" ON "AgentRun"("tenantId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AgentRun_tenantId_agentId_createdAt_idx" ON "AgentRun"("tenantId", "agentId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_tenantId_id_key" ON "AgentRun"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_tenantId_correlationId_key" ON "AgentRun"("tenantId", "correlationId");

-- CreateIndex
CREATE INDEX "AgentRunStep_tenantId_agentRunId_status_idx" ON "AgentRunStep"("tenantId", "agentRunId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRunStep_tenantId_id_key" ON "AgentRunStep"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRunStep_tenantId_agentRunId_sequence_key" ON "AgentRunStep"("tenantId", "agentRunId", "sequence");

-- CreateIndex
CREATE INDEX "TokenUsage_tenantId_createdAt_idx" ON "TokenUsage"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TokenUsage_tenantId_agentRunId_idx" ON "TokenUsage"("tenantId", "agentRunId");

-- CreateIndex
CREATE INDEX "GoldenCase_tenantId_agentId_deletedAt_idx" ON "GoldenCase"("tenantId", "agentId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoldenCase_tenantId_id_key" ON "GoldenCase"("tenantId", "id");

-- CreateIndex
CREATE INDEX "EvaluationRun_tenantId_status_createdAt_idx" ON "EvaluationRun"("tenantId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationRun_tenantId_id_key" ON "EvaluationRun"("tenantId", "id");

-- CreateIndex
CREATE INDEX "EvaluationResult_tenantId_goldenCaseId_idx" ON "EvaluationResult"("tenantId", "goldenCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationResult_tenantId_evaluationRunId_goldenCaseId_key" ON "EvaluationResult"("tenantId", "evaluationRunId", "goldenCaseId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDefinition" ADD CONSTRAINT "AgentDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_tenantId_conversationId_fkey" FOREIGN KEY ("tenantId", "conversationId") REFERENCES "Conversation"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_tenantId_documentId_fkey" FOREIGN KEY ("tenantId", "documentId") REFERENCES "Document"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_tenantId_agentId_fkey" FOREIGN KEY ("tenantId", "agentId") REFERENCES "AgentDefinition"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_tenantId_conversationId_fkey" FOREIGN KEY ("tenantId", "conversationId") REFERENCES "Conversation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunStep" ADD CONSTRAINT "AgentRunStep_tenantId_agentRunId_fkey" FOREIGN KEY ("tenantId", "agentRunId") REFERENCES "AgentRun"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_tenantId_agentRunId_fkey" FOREIGN KEY ("tenantId", "agentRunId") REFERENCES "AgentRun"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsage" ADD CONSTRAINT "TokenUsage_tenantId_runStepId_fkey" FOREIGN KEY ("tenantId", "runStepId") REFERENCES "AgentRunStep"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldenCase" ADD CONSTRAINT "GoldenCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldenCase" ADD CONSTRAINT "GoldenCase_tenantId_agentId_fkey" FOREIGN KEY ("tenantId", "agentId") REFERENCES "AgentDefinition"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationRun" ADD CONSTRAINT "EvaluationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_tenantId_evaluationRunId_fkey" FOREIGN KEY ("tenantId", "evaluationRunId") REFERENCES "EvaluationRun"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_tenantId_goldenCaseId_fkey" FOREIGN KEY ("tenantId", "goldenCaseId") REFERENCES "GoldenCase"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain constraints not represented by the Prisma schema language.
ALTER TABLE "AgentDefinition"
  ADD CONSTRAINT "AgentDefinition_maxSteps_check" CHECK ("maxSteps" > 0),
  ADD CONSTRAINT "AgentDefinition_maxToolCalls_check" CHECK ("maxToolCalls" >= 0),
  ADD CONSTRAINT "AgentDefinition_maxTokens_check" CHECK ("maxTokens" IS NULL OR "maxTokens" > 0),
  ADD CONSTRAINT "AgentDefinition_timeoutMs_check" CHECK ("timeoutMs" > 0),
  ALTER COLUMN "enabledToolIds" SET NOT NULL,
  ALTER COLUMN "knowledgeBaseIds" SET NOT NULL;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_sequence_check" CHECK ("sequence" >= 0);

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_sizeBytes_check" CHECK ("sizeBytes" >= 0);

ALTER TABLE "DocumentChunk"
  ADD CONSTRAINT "DocumentChunk_ordinal_check" CHECK ("ordinal" >= 0),
  ADD CONSTRAINT "DocumentChunk_tokenCount_check" CHECK ("tokenCount" IS NULL OR "tokenCount" >= 0),
  ADD CONSTRAINT "DocumentChunk_pageNumber_check" CHECK ("pageNumber" IS NULL OR "pageNumber" > 0);

ALTER TABLE "AgentRunStep"
  ADD CONSTRAINT "AgentRunStep_sequence_check" CHECK ("sequence" >= 0),
  ADD CONSTRAINT "AgentRunStep_durationMs_check" CHECK ("durationMs" IS NULL OR "durationMs" >= 0);

ALTER TABLE "TokenUsage"
  ADD CONSTRAINT "TokenUsage_inputTokens_check" CHECK ("inputTokens" >= 0),
  ADD CONSTRAINT "TokenUsage_outputTokens_check" CHECK ("outputTokens" >= 0),
  ADD CONSTRAINT "TokenUsage_costMicros_check" CHECK ("costMicros" >= 0),
  ADD CONSTRAINT "TokenUsage_latencyMs_check" CHECK ("latencyMs" >= 0),
  ADD CONSTRAINT "TokenUsage_retryCount_check" CHECK ("retryCount" >= 0);

ALTER TABLE "GoldenCase"
  ALTER COLUMN "expectedFacts" SET NOT NULL,
  ALTER COLUMN "forbiddenClaims" SET NOT NULL,
  ALTER COLUMN "expectedSources" SET NOT NULL;

ALTER TABLE "EvaluationResult"
  ADD CONSTRAINT "EvaluationResult_score_check" CHECK ("score" >= 0 AND "score" <= 1),
  ADD CONSTRAINT "EvaluationResult_latencyMs_check" CHECK ("latencyMs" >= 0),
  ADD CONSTRAINT "EvaluationResult_inputTokens_check" CHECK ("inputTokens" >= 0),
  ADD CONSTRAINT "EvaluationResult_outputTokens_check" CHECK ("outputTokens" >= 0);
