import { Module } from "@nestjs/common";

import {
  PrismaExternalConnectionRepository,
  PrismaGmailDraftReviewRepository
} from "@devhub/database";

import { AuthModule } from "../auth/auth.module";
import { DATABASE_CLIENT } from "../database/database.module";
import { GmailController } from "./gmail.controller";
import { GmailService } from "./gmail.service";
import {
  EXTERNAL_CONNECTION_REPOSITORY,
  GMAIL_DRAFT_REVIEW_REPOSITORY
} from "./gmail.tokens";
import { GmailOAuthStateService } from "./oauth-state.service";
import { TokenCryptoService } from "./token-crypto.service";

@Module({
  imports: [AuthModule],
  controllers: [GmailController],
  providers: [
    {
      provide: EXTERNAL_CONNECTION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<
          typeof PrismaExternalConnectionRepository
        >[0]
      ): PrismaExternalConnectionRepository =>
        new PrismaExternalConnectionRepository(database)
    },
    {
      provide: GMAIL_DRAFT_REVIEW_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<
          typeof PrismaGmailDraftReviewRepository
        >[0]
      ): PrismaGmailDraftReviewRepository =>
        new PrismaGmailDraftReviewRepository(database)
    },
    GmailOAuthStateService,
    GmailService,
    TokenCryptoService
  ]
})
export class GmailModule {}
