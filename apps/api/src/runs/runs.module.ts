import { Module } from "@nestjs/common";

import { PrismaAgentRunRepository } from "@devhub/database";

import { AgentsModule } from "../agents/agents.module";
import { AuthModule } from "../auth/auth.module";
import { DATABASE_CLIENT } from "../database/database.module";
import { BullMqAgentRunQueue } from "./agent-run-queue.service";
import { loadRunsConfig } from "./runs.config";
import { RunsController } from "./runs.controller";
import { RunsService } from "./runs.service";
import { AGENT_RUN_QUEUE, AGENT_RUN_REPOSITORY } from "./runs.tokens";

@Module({
  imports: [AgentsModule, AuthModule],
  controllers: [RunsController],
  providers: [
    { provide: "RUNS_CONFIG", useFactory: loadRunsConfig },
    {
      provide: AGENT_RUN_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<typeof PrismaAgentRunRepository>[0]
      ): PrismaAgentRunRepository => new PrismaAgentRunRepository(database)
    },
    { provide: AGENT_RUN_QUEUE, useExisting: BullMqAgentRunQueue },
    BullMqAgentRunQueue,
    RunsService
  ],
  exports: [AGENT_RUN_REPOSITORY, AGENT_RUN_QUEUE, RunsService]
})
export class RunsModule {}
