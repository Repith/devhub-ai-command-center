import { Module } from "@nestjs/common";

import { PrismaAgentDefinitionRepository } from "@devhub/database";

import { AuthModule } from "../auth/auth.module";
import { DATABASE_CLIENT } from "../database/database.module";
import { AgentsController } from "./agents.controller";
import { AgentsService } from "./agents.service";
import { AGENT_DEFINITION_REPOSITORY } from "./agents.tokens";

@Module({
  imports: [AuthModule],
  controllers: [AgentsController],
  providers: [
    {
      provide: AGENT_DEFINITION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<
          typeof PrismaAgentDefinitionRepository
        >[0]
      ): PrismaAgentDefinitionRepository =>
        new PrismaAgentDefinitionRepository(database)
    },
    AgentsService
  ]
})
export class AgentsModule {}
