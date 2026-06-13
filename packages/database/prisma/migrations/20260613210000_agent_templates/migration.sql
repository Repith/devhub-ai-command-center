ALTER TABLE "AgentDefinition" ADD COLUMN "templateKey" TEXT;

CREATE UNIQUE INDEX "AgentDefinition_tenantId_templateKey_key" ON "AgentDefinition"("tenantId", "templateKey");
