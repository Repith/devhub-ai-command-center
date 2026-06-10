import { Global, Module } from "@nestjs/common";

import { PrismaAuditLogRepository } from "@devhub/database";

import { AuthModule } from "../auth/auth.module";
import { DATABASE_CLIENT } from "../database/database.module";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";
import { AUDIT_LOG_REPOSITORY } from "./audit.tokens";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [
    {
      provide: AUDIT_LOG_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<typeof PrismaAuditLogRepository>[0]
      ): PrismaAuditLogRepository => new PrismaAuditLogRepository(database)
    },
    AuditService
  ],
  exports: [AuditService, AUDIT_LOG_REPOSITORY]
})
export class AuditModule {}
