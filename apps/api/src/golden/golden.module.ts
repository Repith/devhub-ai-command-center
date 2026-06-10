import { Module } from "@nestjs/common";

import { PrismaGoldenEvaluationRepository } from "@devhub/database";

import { AgentsModule } from "../agents/agents.module";
import { AuthModule } from "../auth/auth.module";
import { DATABASE_CLIENT } from "../database/database.module";
import { loadRunsConfig } from "../runs/runs.config";
import { BullMqGoldenEvaluationQueue } from "./golden-queue.service";
import { GoldenController } from "./golden.controller";
import { GoldenService } from "./golden.service";
import {
  GOLDEN_EVALUATION_QUEUE,
  GOLDEN_EVALUATION_REPOSITORY
} from "./golden.tokens";

@Module({
  imports: [AgentsModule, AuthModule],
  controllers: [GoldenController],
  providers: [
    { provide: "RUNS_CONFIG", useFactory: loadRunsConfig },
    {
      provide: GOLDEN_EVALUATION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<
          typeof PrismaGoldenEvaluationRepository
        >[0]
      ): PrismaGoldenEvaluationRepository =>
        new PrismaGoldenEvaluationRepository(database)
    },
    {
      provide: GOLDEN_EVALUATION_QUEUE,
      useExisting: BullMqGoldenEvaluationQueue
    },
    BullMqGoldenEvaluationQueue,
    GoldenService
  ],
  exports: [GOLDEN_EVALUATION_REPOSITORY, GOLDEN_EVALUATION_QUEUE]
})
export class GoldenModule {}
