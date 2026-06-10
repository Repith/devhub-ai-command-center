import { Module } from "@nestjs/common";

import { PrismaUsageRepository } from "@devhub/database";

import { AuthModule } from "../auth/auth.module";
import { DATABASE_CLIENT } from "../database/database.module";
import { UsageController } from "./usage.controller";
import { UsageService } from "./usage.service";
import { USAGE_REPOSITORY } from "./usage.tokens";

@Module({
  imports: [AuthModule],
  controllers: [UsageController],
  providers: [
    {
      provide: USAGE_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<typeof PrismaUsageRepository>[0]
      ): PrismaUsageRepository => new PrismaUsageRepository(database)
    },
    UsageService
  ]
})
export class UsageModule {}
