import { config as loadEnvironment } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

loadEnvironment({
  path: resolve(import.meta.dirname, "../../.env"),
  quiet: true
});

const schemaOnlyUrl =
  "postgresql://devhub:devhub@localhost:5432/devhub?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    url: process.env.DATABASE_URL ?? schemaOnlyUrl
  }
});
