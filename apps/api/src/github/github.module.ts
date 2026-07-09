import { Module } from "@nestjs/common";

import {
  PrismaExternalConnectionRepository,
  PrismaExternalInstallationRepository,
  PrismaGithubActionReviewRepository
} from "@devhub/database";

import { AuthModule } from "../auth/auth.module";
import { DATABASE_CLIENT } from "../database/database.module";
import { GithubController } from "./github.controller";
import { GithubService } from "./github.service";
import {
  GITHUB_ACTION_REVIEW_REPOSITORY,
  GITHUB_CONNECTION_REPOSITORY,
  GITHUB_INSTALLATION_REPOSITORY
} from "./github.tokens";
import { GithubOAuthStateService } from "./oauth-state.service";
import { GithubTokenCryptoService } from "./token-crypto.service";

@Module({
  imports: [AuthModule],
  controllers: [GithubController],
  providers: [
    {
      provide: GITHUB_CONNECTION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<
          typeof PrismaExternalConnectionRepository
        >[0]
      ): PrismaExternalConnectionRepository =>
        new PrismaExternalConnectionRepository(database)
    },
    {
      provide: GITHUB_INSTALLATION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<
          typeof PrismaExternalInstallationRepository
        >[0]
      ): PrismaExternalInstallationRepository =>
        new PrismaExternalInstallationRepository(database)
    },
    {
      provide: GITHUB_ACTION_REVIEW_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<
          typeof PrismaGithubActionReviewRepository
        >[0]
      ): PrismaGithubActionReviewRepository =>
        new PrismaGithubActionReviewRepository(database)
    },
    GithubOAuthStateService,
    GithubService,
    GithubTokenCryptoService
  ]
})
export class GithubModule {}
