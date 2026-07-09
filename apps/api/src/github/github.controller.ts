import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common";

import {
  createGithubActionReviewSchema,
  updateGithubActionReviewSchema,
  uuidSchema,
  githubOAuthCallbackSchema,
  type CreateGithubActionReview,
  type GithubActionReview,
  type GithubActionReviewList,
  type GithubConnectResponse,
  type GithubConnectionStatus,
  type GithubOAuthCallback,
  type GithubRepositoryList,
  type UpdateGithubActionReview
} from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { GithubService } from "./github.service";

@Controller("github")
export class GithubController {
  public constructor(
    @Inject(GithubService) private readonly github: GithubService
  ) {}

  @Get("status")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public status(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<GithubConnectionStatus> {
    return this.github.status(principal);
  }

  @Post("connect")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public connect(
    @CurrentUser() principal: RequestPrincipal
  ): GithubConnectResponse {
    return this.github.connect(principal);
  }

  @Post("oauth/callback")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public completeOAuth(
    @CurrentUser() principal: RequestPrincipal,
    @Body(new ZodValidationPipe(githubOAuthCallbackSchema))
    input: GithubOAuthCallback
  ): Promise<GithubConnectionStatus> {
    return this.github.completeOAuth(principal, input);
  }

  @Post("installations/sync")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public syncInstallations(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<GithubConnectionStatus> {
    return this.github.syncInstallations(principal);
  }

  @Get("repositories")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public repositories(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<GithubRepositoryList> {
    return this.github.listRepositories(principal);
  }

  @Get("action-reviews")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public listActionReviews(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<GithubActionReviewList> {
    return this.github.listActionReviews(principal);
  }

  @Post("action-reviews")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public createActionReview(
    @CurrentUser() principal: RequestPrincipal,
    @Body(new ZodValidationPipe(createGithubActionReviewSchema))
    input: CreateGithubActionReview
  ): Promise<GithubActionReview> {
    return this.github.createActionReview(principal, input);
  }

  @Patch("action-reviews/:reviewId")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public updateActionReview(
    @CurrentUser() principal: RequestPrincipal,
    @Param("reviewId", new ZodValidationPipe(uuidSchema)) reviewId: string,
    @Body(new ZodValidationPipe(updateGithubActionReviewSchema))
    input: UpdateGithubActionReview
  ): Promise<GithubActionReview> {
    return this.github.updateActionReview(principal, reviewId, input);
  }

  @Post("action-reviews/:reviewId/submit")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public submitActionReview(
    @CurrentUser() principal: RequestPrincipal,
    @Param("reviewId", new ZodValidationPipe(uuidSchema)) reviewId: string
  ): Promise<GithubActionReview> {
    return this.github.submitActionReview(principal, reviewId);
  }

  @Post("action-reviews/:reviewId/reject")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public rejectActionReview(
    @CurrentUser() principal: RequestPrincipal,
    @Param("reviewId", new ZodValidationPipe(uuidSchema)) reviewId: string
  ): Promise<GithubActionReview> {
    return this.github.rejectActionReview(principal, reviewId);
  }

  @Delete("disconnect")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public disconnect(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<GithubConnectionStatus> {
    return this.github.disconnect(principal);
  }

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  public webhook(
    @Headers("x-github-event") event: string | undefined,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Body() payload: unknown
  ): Promise<{ accepted: true }> {
    return this.github.handleWebhook({ event, signature, payload });
  }
}
