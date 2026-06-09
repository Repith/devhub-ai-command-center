-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- AlterTable
ALTER TABLE "Conversation"
  ADD COLUMN "agentId" UUID;

ALTER TABLE "Message"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "inputTokens" INTEGER,
  ADD COLUMN "outputTokens" INTEGER,
  ADD COLUMN "durationMs" INTEGER,
  ALTER COLUMN "role" TYPE "MessageRole"
    USING (
      CASE
        WHEN UPPER("role") = 'ASSISTANT' THEN 'ASSISTANT'::"MessageRole"
        ELSE 'USER'::"MessageRole"
      END
    );

-- CreateIndex
CREATE INDEX "Conversation_tenantId_agentId_updatedAt_idx"
  ON "Conversation"("tenantId", "agentId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_tenantId_agentId_fkey"
  FOREIGN KEY ("tenantId", "agentId")
  REFERENCES "AgentDefinition"("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Domain constraints not represented by the Prisma schema language.
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_inputTokens_check"
    CHECK ("inputTokens" IS NULL OR "inputTokens" >= 0),
  ADD CONSTRAINT "Message_outputTokens_check"
    CHECK ("outputTokens" IS NULL OR "outputTokens" >= 0),
  ADD CONSTRAINT "Message_durationMs_check"
    CHECK ("durationMs" IS NULL OR "durationMs" >= 0),
  ADD CONSTRAINT "Message_assistant_usage_check"
    CHECK (
      ("role" = 'USER' AND "provider" IS NULL AND "model" IS NULL
        AND "inputTokens" IS NULL AND "outputTokens" IS NULL
        AND "durationMs" IS NULL)
      OR
      ("role" = 'ASSISTANT' AND "provider" IS NOT NULL
        AND "model" IS NOT NULL AND "inputTokens" IS NOT NULL
        AND "outputTokens" IS NOT NULL AND "durationMs" IS NOT NULL)
    );
