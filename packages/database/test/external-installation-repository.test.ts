import { describe, expect, it } from "vitest";

import { PrismaExternalInstallationRepository } from "../src/external-installation-repository";

describe("PrismaExternalInstallationRepository", () => {
  it("syncs GitHub installations and repositories with tenant scope", async () => {
    const calls: unknown[] = [];
    const repository = new PrismaExternalInstallationRepository({
      externalInstallation: {
        upsert: (input: unknown) => {
          calls.push({ model: "installation", input });
          return Promise.resolve({ id: "installation-1" });
        }
      },
      externalRepository: {
        upsert: (input: unknown) => {
          calls.push({ model: "repository", input });
          return Promise.resolve(input);
        }
      }
    } as never);

    await repository.syncGithubInstallations(context(), [
      {
        providerInstallationId: "123",
        accountLogin: "octo-org",
        accountType: "Organization",
        repositorySelection: "selected",
        permissions: { contents: "read" },
        repositories: [
          {
            providerRepositoryId: "456",
            owner: "octo-org",
            name: "hello-world",
            fullName: "octo-org/hello-world",
            private: false,
            defaultBranch: "main",
            htmlUrl: "https://github.com/octo-org/hello-world"
          }
        ]
      }
    ]);

    expect(JSON.stringify(calls)).toContain('"tenantId":"tenant-1"');
    expect(JSON.stringify(calls)).toContain('"provider":"GITHUB"');
    expect(JSON.stringify(calls)).toContain('"providerInstallationId":"123"');
    expect(JSON.stringify(calls)).toContain('"providerRepositoryId":"456"');
  });

  it("lists only active GitHub repositories for the tenant", async () => {
    const calls: unknown[] = [];
    const repository = new PrismaExternalInstallationRepository({
      externalRepository: {
        findMany: (input: unknown) => {
          calls.push(input);
          return Promise.resolve([]);
        }
      }
    } as never);

    await repository.listRepositories(context());

    expect(calls).toEqual([
      {
        where: {
          tenantId: "tenant-1",
          provider: "GITHUB",
          deletedAt: null,
          installation: {
            status: "ACTIVE",
            deletedAt: null
          }
        },
        orderBy: [{ fullName: "asc" }]
      }
    ]);
  });

  it("marks GitHub installations deleted without deleting rows", async () => {
    const calls: unknown[] = [];
    const repository = new PrismaExternalInstallationRepository({
      externalRepository: {
        updateMany: (input: unknown) => {
          calls.push({ model: "repository", input });
          return input;
        }
      },
      externalInstallation: {
        updateMany: (input: unknown) => {
          calls.push({ model: "installation", input });
          return input;
        }
      },
      $transaction: (input: unknown) => Promise.resolve(input)
    } as never);

    await repository.disconnectGithub(context());

    expect(JSON.stringify(calls)).toContain('"tenantId":"tenant-1"');
    expect(JSON.stringify(calls)).toContain('"status":"DELETED"');
    expect(JSON.stringify(calls)).toContain('"provider":"GITHUB"');
  });
});

function context(): {
  correlationId: string;
  tenantId: string;
  userId: string;
} {
  return {
    tenantId: "tenant-1",
    userId: "user-1",
    correlationId: "test-correlation"
  };
}
