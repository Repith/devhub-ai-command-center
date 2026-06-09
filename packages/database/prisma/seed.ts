import { createDatabaseClient } from "../src/client.js";

const SEED_PASSWORD_PLACEHOLDER = "development-placeholder-not-a-password-hash";

const seedData = [
  {
    userId: "10000000-0000-4000-8000-000000000001",
    email: "owner.alpha@devhub.local",
    tenantId: "20000000-0000-4000-8000-000000000001",
    tenantName: "Alpha Workspace",
    tenantSlug: "alpha-workspace",
    agentId: "30000000-0000-4000-8000-000000000001"
  },
  {
    userId: "10000000-0000-4000-8000-000000000002",
    email: "owner.beta@devhub.local",
    tenantId: "20000000-0000-4000-8000-000000000002",
    tenantName: "Beta Workspace",
    tenantSlug: "beta-workspace",
    agentId: "30000000-0000-4000-8000-000000000002"
  }
] as const;

async function seed(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to seed the database.");
  }

  const database = createDatabaseClient(connectionString);

  try {
    for (const entry of seedData) {
      await database.$transaction([
        database.user.upsert({
          where: { id: entry.userId },
          update: { email: entry.email },
          create: {
            id: entry.userId,
            email: entry.email,
            passwordHash: SEED_PASSWORD_PLACEHOLDER
          }
        }),
        database.tenant.upsert({
          where: { id: entry.tenantId },
          update: { name: entry.tenantName, slug: entry.tenantSlug },
          create: {
            id: entry.tenantId,
            name: entry.tenantName,
            slug: entry.tenantSlug
          }
        })
      ]);

      await database.membership.upsert({
        where: {
          tenantId_userId: {
            tenantId: entry.tenantId,
            userId: entry.userId
          }
        },
        update: { role: "OWNER" },
        create: {
          tenantId: entry.tenantId,
          userId: entry.userId,
          role: "OWNER"
        }
      });

      await database.agentDefinition.upsert({
        where: {
          tenantId_id: {
            tenantId: entry.tenantId,
            id: entry.agentId
          }
        },
        update: {
          name: "Knowledge Assistant",
          deletedAt: null
        },
        create: {
          id: entry.agentId,
          tenantId: entry.tenantId,
          name: "Knowledge Assistant",
          provider: "ollama",
          model: "qwen3:8b",
          systemPrompt: "Answer using authorized workspace knowledge."
        }
      });
    }
  } finally {
    await database.$disconnect();
  }
}

void seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
