import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";

import {
  createNewsFeedSchema,
  updateNewsFeedSchema,
  uuidSchema,
  type CreateNewsFeed,
  type NewsFeed,
  type NewsFeedList,
  type NewsFeedRefreshResponse,
  type UpdateNewsFeed
} from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NewsService } from "./news.service";

@Controller("news/feeds")
@UseGuards(AuthGuard, RolesGuard)
export class NewsController {
  public constructor(@Inject(NewsService) private readonly news: NewsService) {}

  @Get()
  @Roles("OWNER", "ADMIN", "MEMBER")
  public list(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<NewsFeedList> {
    return this.news.list(principal);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public refresh(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<NewsFeedRefreshResponse> {
    return this.news.refresh(principal);
  }

  @Post()
  @Roles("OWNER", "ADMIN")
  public create(
    @CurrentUser() principal: RequestPrincipal,
    @Body(new ZodValidationPipe(createNewsFeedSchema)) input: CreateNewsFeed
  ): Promise<NewsFeed> {
    return this.news.create(principal, input);
  }

  @Patch(":feedId")
  @Roles("OWNER", "ADMIN")
  public update(
    @CurrentUser() principal: RequestPrincipal,
    @Param("feedId", new ZodValidationPipe(uuidSchema)) feedId: string,
    @Body(new ZodValidationPipe(updateNewsFeedSchema)) input: UpdateNewsFeed
  ): Promise<NewsFeed> {
    return this.news.update(principal, feedId, input);
  }

  @Delete(":feedId")
  @Roles("OWNER", "ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  public delete(
    @CurrentUser() principal: RequestPrincipal,
    @Param("feedId", new ZodValidationPipe(uuidSchema)) feedId: string
  ): Promise<void> {
    return this.news.delete(principal, feedId);
  }
}
