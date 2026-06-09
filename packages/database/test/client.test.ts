import { describe, expect, it } from "vitest";

import { createDatabaseClient } from "../src";

describe("database client", () => {
  it("creates a Prisma client without opening a connection eagerly", async () => {
    const database = createDatabaseClient(
      "postgresql://devhub:devhub@localhost:5432/devhub?schema=public"
    );

    expect(database).toBeDefined();
    await database.$disconnect();
  });
});
