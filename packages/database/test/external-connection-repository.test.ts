import { describe, expect, it } from "vitest";

import { PrismaExternalConnectionRepository } from "../src/external-connection-repository";

describe("PrismaExternalConnectionRepository", () => {
  it("queries external connections by tenant, user, and provider", async () => {
    const calls: unknown[] = [];
    const repository = new PrismaExternalConnectionRepository({
      externalConnection: {
        findUnique: (input: unknown) => {
          calls.push(input);
          return Promise.resolve(null);
        }
      }
    } as never);

    await repository.find(context(), "GITHUB");

    expect(calls).toEqual([
      {
        where: {
          tenantId_userId_provider: {
            tenantId: "tenant-1",
            userId: "user-1",
            provider: "GITHUB"
          }
        }
      }
    ]);
  });

  it("keeps Gmail wrappers scoped to the Gmail provider", async () => {
    const calls: unknown[] = [];
    const repository = new PrismaExternalConnectionRepository({
      externalConnection: {
        findUnique: (input: unknown) => {
          calls.push(input);
          return Promise.resolve(null);
        }
      }
    } as never);

    await repository.findGmail(context());

    expect(JSON.stringify(calls)).toContain('"provider":"GMAIL"');
  });

  it("disconnects a provider without deleting the connection row", async () => {
    const calls: unknown[] = [];
    const repository = new PrismaExternalConnectionRepository({
      externalConnection: {
        upsert: (input: unknown) => {
          calls.push(input);
          return Promise.resolve(input);
        }
      }
    } as never);

    await repository.disconnect(context(), "GITHUB");

    expect(calls).toEqual([
      expect.objectContaining({
        update: expect.objectContaining({
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          status: "DISCONNECTED"
        })
      })
    ]);
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
