import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";

describe("AppModule", () => {
  const originalEnvironment = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("resolves feature-module authentication dependencies", async () => {
    process.env.DATABASE_URL =
      "postgresql://devhub:devhub@localhost:5432/devhub?schema=public";
    process.env.JWT_SECRET = "unit-test-secret-with-at-least-32-characters";
    process.env.JWT_ISSUER = "devhub-ai-command-center";
    process.env.JWT_AUDIENCE = "devhub-api";

    const module = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    expect(module).toBeDefined();
    await module.close();
  });
});
