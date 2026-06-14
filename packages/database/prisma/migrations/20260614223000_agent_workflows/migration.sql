ALTER TABLE "AgentDefinition"
  ADD COLUMN "workflowDefinition" JSONB,
  ADD COLUMN "workflowVersion" INTEGER;
