import "dotenv/config";

import { defineConfig } from "prisma/config";

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
