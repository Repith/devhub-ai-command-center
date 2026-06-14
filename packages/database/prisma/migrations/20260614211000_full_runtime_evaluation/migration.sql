CREATE TYPE "EvaluationMode" AS ENUM ('FAST_LLM_ONLY', 'FULL_AGENT_RUNTIME');

ALTER TABLE "EvaluationRun"
  ADD COLUMN "mode" "EvaluationMode" NOT NULL DEFAULT 'FAST_LLM_ONLY';

ALTER TABLE "EvaluationResult"
  ADD COLUMN "mode" "EvaluationMode" NOT NULL DEFAULT 'FAST_LLM_ONLY',
  ADD COLUMN "agentRunId" UUID,
  ADD COLUMN "toolCallsUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "terminalStatus" TEXT,
  ADD COLUMN "errorCode" TEXT,
  ADD COLUMN "errorMessagePreview" TEXT,
  ADD COLUMN "workflowVersion" TEXT;

CREATE INDEX "EvaluationResult_tenantId_agentRunId_idx"
  ON "EvaluationResult"("tenantId", "agentRunId");
