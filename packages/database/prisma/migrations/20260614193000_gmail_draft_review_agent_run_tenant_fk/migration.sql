ALTER TABLE "GmailDraftReview"
  DROP CONSTRAINT "GmailDraftReview_agentRunId_fkey";

ALTER TABLE "GmailDraftReview"
  ADD CONSTRAINT "GmailDraftReview_tenantId_agentRunId_fkey"
  FOREIGN KEY ("tenantId", "agentRunId")
  REFERENCES "AgentRun"("tenantId", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
