import type { TenantContext } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";

export type ExternalInstallationProvider = "GITHUB";
export type ExternalInstallationStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

export interface ExternalInstallationRecord {
  id: string;
  tenantId: string;
  connectedByUserId: string;
  provider: ExternalInstallationProvider;
  providerInstallationId: string;
  accountLogin: string;
  accountType: string;
  repositorySelection: string | null;
  permissions: Record<string, string>;
  status: ExternalInstallationStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ExternalRepositoryRecord {
  id: string;
  tenantId: string;
  installationId: string;
  provider: ExternalInstallationProvider;
  providerRepositoryId: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string | null;
  htmlUrl: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ExternalRepositoryAuthorizationRecord extends ExternalRepositoryRecord {
  providerInstallationId: string;
}

export interface SyncExternalInstallationInput {
  providerInstallationId: string;
  accountLogin: string;
  accountType: string;
  repositorySelection: string | null;
  permissions: Record<string, string>;
  repositories: readonly SyncExternalRepositoryInput[];
}

export interface SyncExternalRepositoryInput {
  providerRepositoryId: string;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string | null;
  htmlUrl: string;
}

export class PrismaExternalInstallationRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async syncGithubInstallations(
    context: TenantContext,
    installations: readonly SyncExternalInstallationInput[]
  ): Promise<{
    installations: ExternalInstallationRecord[];
    repositories: ExternalRepositoryRecord[];
  }> {
    const syncedInstallations: ExternalInstallationRecord[] = [];
    const syncedRepositories: ExternalRepositoryRecord[] = [];
    for (const installation of installations) {
      const record = await this.upsertInstallation(context, installation);
      syncedInstallations.push(record);
      const repositories = await this.syncRepositories(
        context,
        record.id,
        installation.repositories
      );
      syncedRepositories.push(...repositories);
    }
    return {
      installations: syncedInstallations,
      repositories: syncedRepositories
    };
  }

  public countActive(context: TenantContext): Promise<{
    installations: number;
    repositories: number;
  }> {
    return Promise.all([
      this.database.externalInstallation.count({
        where: githubActiveInstallationWhere(context)
      }),
      this.database.externalRepository.count({
        where: githubActiveRepositoryWhere(context)
      })
    ]).then(([installations, repositories]) => ({
      installations,
      repositories
    }));
  }

  public async listRepositories(
    context: TenantContext
  ): Promise<ExternalRepositoryRecord[]> {
    const records = await this.database.externalRepository.findMany({
      where: githubActiveRepositoryWhere(context),
      orderBy: [{ fullName: "asc" }]
    });
    return records.map((record) => record as ExternalRepositoryRecord);
  }

  public async findActiveRepositoryByFullName(
    context: TenantContext,
    fullName: string
  ): Promise<ExternalRepositoryRecord | null> {
    const record = await this.database.externalRepository.findFirst({
      where: {
        ...githubActiveRepositoryWhere(context),
        fullName
      }
    });
    return record ? (record as ExternalRepositoryRecord) : null;
  }

  public async findActiveRepositoryAuthorizationByFullName(
    context: TenantContext,
    fullName: string
  ): Promise<ExternalRepositoryAuthorizationRecord | null> {
    const record = await this.database.externalRepository.findFirst({
      where: {
        ...githubActiveRepositoryWhere(context),
        fullName
      },
      include: {
        installation: {
          select: {
            providerInstallationId: true
          }
        }
      }
    });
    if (!record) {
      return null;
    }
    return {
      ...(record as ExternalRepositoryRecord),
      providerInstallationId: record.installation.providerInstallationId
    };
  }

  public disconnectGithub(context: TenantContext): Promise<unknown> {
    return this.database.$transaction([
      this.database.externalRepository.updateMany({
        where: { tenantId: context.tenantId, provider: "GITHUB" },
        data: { deletedAt: new Date() }
      }),
      this.database.externalInstallation.updateMany({
        where: { tenantId: context.tenantId, provider: "GITHUB" },
        data: { status: "DELETED", deletedAt: new Date() }
      })
    ]);
  }

  public markGithubInstallation(
    providerInstallationId: string,
    status: ExternalInstallationStatus
  ): Promise<{ count: number }> {
    return this.database.externalInstallation.updateMany({
      where: {
        provider: "GITHUB",
        providerInstallationId
      },
      data: {
        status,
        deletedAt: status === "ACTIVE" ? null : new Date()
      }
    });
  }

  private async upsertInstallation(
    context: TenantContext,
    input: SyncExternalInstallationInput
  ): Promise<ExternalInstallationRecord> {
    const record = await this.database.externalInstallation.upsert({
      where: {
        tenantId_provider_providerInstallationId: {
          tenantId: context.tenantId,
          provider: "GITHUB",
          providerInstallationId: input.providerInstallationId
        }
      },
      update: installationData(context, input),
      create: {
        tenantId: context.tenantId,
        provider: "GITHUB",
        ...installationData(context, input)
      }
    });
    return record as ExternalInstallationRecord;
  }

  private async syncRepositories(
    context: TenantContext,
    installationId: string,
    repositories: readonly SyncExternalRepositoryInput[]
  ): Promise<ExternalRepositoryRecord[]> {
    const records: ExternalRepositoryRecord[] = [];
    for (const repository of repositories) {
      records.push(
        await this.upsertRepository(context, installationId, repository)
      );
    }
    return records;
  }

  private async upsertRepository(
    context: TenantContext,
    installationId: string,
    input: SyncExternalRepositoryInput
  ): Promise<ExternalRepositoryRecord> {
    const record = await this.database.externalRepository.upsert({
      where: {
        tenantId_provider_providerRepositoryId: {
          tenantId: context.tenantId,
          provider: "GITHUB",
          providerRepositoryId: input.providerRepositoryId
        }
      },
      update: repositoryData(installationId, input),
      create: {
        tenantId: context.tenantId,
        provider: "GITHUB",
        ...repositoryData(installationId, input)
      }
    });
    return record as ExternalRepositoryRecord;
  }
}

function installationData(
  context: TenantContext,
  input: SyncExternalInstallationInput
): {
  accountLogin: string;
  accountType: string;
  connectedByUserId: string;
  deletedAt: null;
  permissions: Record<string, string>;
  providerInstallationId: string;
  repositorySelection: string | null;
  status: "ACTIVE";
} {
  return {
    connectedByUserId: context.userId,
    providerInstallationId: input.providerInstallationId,
    accountLogin: input.accountLogin,
    accountType: input.accountType,
    repositorySelection: input.repositorySelection,
    permissions: input.permissions,
    status: "ACTIVE",
    deletedAt: null
  };
}

function repositoryData(
  installationId: string,
  input: SyncExternalRepositoryInput
): {
  defaultBranch: string | null;
  deletedAt: null;
  fullName: string;
  htmlUrl: string;
  installationId: string;
  name: string;
  owner: string;
  private: boolean;
  providerRepositoryId: string;
} {
  return {
    installationId,
    providerRepositoryId: input.providerRepositoryId,
    owner: input.owner,
    name: input.name,
    fullName: input.fullName,
    private: input.private,
    defaultBranch: input.defaultBranch,
    htmlUrl: input.htmlUrl,
    deletedAt: null
  };
}

function githubActiveInstallationWhere(context: TenantContext): {
  deletedAt: null;
  provider: "GITHUB";
  status: "ACTIVE";
  tenantId: string;
} {
  return {
    tenantId: context.tenantId,
    provider: "GITHUB",
    status: "ACTIVE",
    deletedAt: null
  };
}

function githubActiveRepositoryWhere(context: TenantContext): {
  deletedAt: null;
  installation: {
    deletedAt: null;
    status: "ACTIVE";
  };
  provider: "GITHUB";
  tenantId: string;
} {
  return {
    tenantId: context.tenantId,
    provider: "GITHUB",
    deletedAt: null,
    installation: {
      status: "ACTIVE",
      deletedAt: null
    }
  };
}
