import { Module } from "@nestjs/common";

import { PrismaNewsFeedRepository } from "@devhub/database";

import { AuthModule } from "../auth/auth.module";
import { DATABASE_CLIENT } from "../database/database.module";
import { NewsController } from "./news.controller";
import { NewsService } from "./news.service";
import { NEWS_FEED_REPOSITORY } from "./news.tokens";

@Module({
  imports: [AuthModule],
  controllers: [NewsController],
  providers: [
    {
      provide: NEWS_FEED_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<typeof PrismaNewsFeedRepository>[0]
      ): PrismaNewsFeedRepository => new PrismaNewsFeedRepository(database)
    },
    NewsService
  ],
  exports: [NEWS_FEED_REPOSITORY]
})
export class NewsModule {}
