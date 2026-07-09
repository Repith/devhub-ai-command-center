CREATE TYPE "ExternalInstallationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

CREATE TABLE "ExternalInstallation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "connectedByUserId" UUID NOT NULL,
    "provider" "ExternalConnectionProvider" NOT NULL,
    "providerInstallationId" TEXT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "repositorySelection" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "status" "ExternalInstallationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ExternalInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalRepository" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "installationId" UUID NOT NULL,
    "provider" "ExternalConnectionProvider" NOT NULL,
    "providerRepositoryId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "private" BOOLEAN NOT NULL,
    "defaultBranch" TEXT,
    "htmlUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ExternalRepository_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalInstallation_tenantId_provider_providerInstallationId_key" ON "ExternalInstallation"("tenantId", "provider", "providerInstallationId");
CREATE UNIQUE INDEX "ExternalInstallation_tenantId_id_key" ON "ExternalInstallation"("tenantId", "id");
CREATE INDEX "ExternalInstallation_tenantId_provider_status_idx" ON "ExternalInstallation"("tenantId", "provider", "status");
CREATE INDEX "ExternalInstallation_tenantId_connectedByUserId_idx" ON "ExternalInstallation"("tenantId", "connectedByUserId");
CREATE UNIQUE INDEX "ExternalRepository_tenantId_provider_providerRepositoryId_key" ON "ExternalRepository"("tenantId", "provider", "providerRepositoryId");
CREATE UNIQUE INDEX "ExternalRepository_tenantId_id_key" ON "ExternalRepository"("tenantId", "id");
CREATE INDEX "ExternalRepository_tenantId_installationId_deletedAt_idx" ON "ExternalRepository"("tenantId", "installationId", "deletedAt");
CREATE INDEX "ExternalRepository_tenantId_provider_fullName_idx" ON "ExternalRepository"("tenantId", "provider", "fullName");

ALTER TABLE "ExternalInstallation" ADD CONSTRAINT "ExternalInstallation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalInstallation" ADD CONSTRAINT "ExternalInstallation_connectedByUserId_fkey" FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExternalRepository" ADD CONSTRAINT "ExternalRepository_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalRepository" ADD CONSTRAINT "ExternalRepository_tenantId_installationId_fkey" FOREIGN KEY ("tenantId", "installationId") REFERENCES "ExternalInstallation"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
