import type { TenantContext } from "@devhub/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  type DatabaseClient,
  PrismaAgentDefinitionRepository
} from "../src";

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase("PrismaAgentDefinitionRepository", () => {
  let database: DatabaseClient;
  let repository: PrismaAgentDefinitionRepository;
  let alphaContext: TenantContext;
  let betaContext: TenantContext;

  beforeAll(async () => {
    database = createDatabaseClient(connectionString!);
    repository = new PrismaAgentDefinitionRepository(database);

    const [alpha, beta] = await Promise.all([
      database.tenant.create({
        data: { name: "Test Alpha", slug: `test-alpha-${crypto.randomUUID()}` }
      }),
      database.tenant.create({
        data: { name: "Test Beta", slug: `test-beta-${crypto.randomUUID()}` }
      })
    ]);

    alphaContext = {
      tenantId: alpha.id,
      userId: crypto.randomUUID(),
      correlationId: crypto.randomUUID()
    };
    betaContext = {
      tenantId: beta.id,
      userId: crypto.randomUUID(),
      correlationId: crypto.randomUUID()
    };
  });

  afterAll(async () => {
    await database.tenant.deleteMany({
      where: { id: { in: [alphaContext.tenantId, betaContext.tenantId] } }
    });
    await database.$disconnect();
  });

  it("never returns an agent owned by another tenant", async () => {
    const agent = await repository.create(alphaContext, {
      name: "Private Alpha Agent",
      provider: "ollama",
      model: "qwen3:8b",
      systemPrompt: "Use Alpha knowledge only."
    });

    await expect(
      repository.findById(alphaContext, agent.id)
    ).resolves.toMatchObject({
      id: agent.id,
      tenantId: alphaContext.tenantId
    });
    await expect(
      repository.findById(betaContext, agent.id)
    ).resolves.toBeNull();
    await expect(
      repository.update(betaContext, agent.id, { name: "Hijacked" })
    ).resolves.toBeNull();
    await expect(repository.delete(betaContext, agent.id)).resolves.toBe(false);
  });
});
