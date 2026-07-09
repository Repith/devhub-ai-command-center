import { Module } from "@nestjs/common";

import { PrismaExternalConnectionRepository } from "@devhub/database";

import { AuthModule } from "../auth/auth.module";
import { DATABASE_CLIENT } from "../database/database.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";
import { INTEGRATIONS_CONNECTION_REPOSITORY } from "./integrations.tokens";

@Module({
  imports: [AuthModule],
  controllers: [IntegrationsController],
  providers: [
    {
      provide: INTEGRATIONS_CONNECTION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<
          typeof PrismaExternalConnectionRepository
        >[0]
      ): PrismaExternalConnectionRepository =>
        new PrismaExternalConnectionRepository(database)
    },
    IntegrationsService
  ]
})
export class IntegrationsModule {}
