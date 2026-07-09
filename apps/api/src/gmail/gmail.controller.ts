import {
  Body,
  Controller,
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
  createGmailDraftReviewSchema,
  gmailOAuthCallbackSchema,
  updateGmailDraftReviewSchema,
  uuidSchema
} from "@devhub/contracts";
import type {
  CreateGmailDraftReview,
  GmailConnectResponse,
  GmailConnectionStatus,
  GmailDevConnectResponse,
  GmailDraftReview,
  GmailDraftReviewList,
  GmailOAuthCallback,
  UpdateGmailDraftReview
} from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { GmailService } from "./gmail.service";

@Controller("gmail")
@UseGuards(AuthGuard, RolesGuard)
export class GmailController {
  public constructor(
    @Inject(GmailService) private readonly gmail: GmailService
  ) {}

  @Get("status")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public status(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<GmailConnectionStatus> {
    return this.gmail.status(principal);
  }

  @Post("connect")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public connect(
    @CurrentUser() principal: RequestPrincipal
  ): GmailConnectResponse {
    return this.gmail.connect(principal);
  }

  @Post("dev/connect")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public connectDevMock(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<GmailDevConnectResponse> {
    return this.gmail.connectDevMock(principal);
  }

  @Post("oauth/callback")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public completeOAuth(
    @CurrentUser() principal: RequestPrincipal,
    @Body(new ZodValidationPipe(gmailOAuthCallbackSchema))
    input: GmailOAuthCallback
  ): Promise<GmailConnectionStatus> {
    return this.gmail.completeOAuth(principal, input);
  }

  @Get("draft-reviews")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public listDraftReviews(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<GmailDraftReviewList> {
    return this.gmail.listDraftReviews(principal);
  }

  @Post("draft-reviews")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public createDraftReview(
    @CurrentUser() principal: RequestPrincipal,
    @Body(new ZodValidationPipe(createGmailDraftReviewSchema))
    input: CreateGmailDraftReview
  ): Promise<GmailDraftReview> {
    return this.gmail.createDraftReview(principal, input);
  }

  @Patch("draft-reviews/:reviewId")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public updateDraftReview(
    @CurrentUser() principal: RequestPrincipal,
    @Param("reviewId", new ZodValidationPipe(uuidSchema)) reviewId: string,
    @Body(new ZodValidationPipe(updateGmailDraftReviewSchema))
    input: UpdateGmailDraftReview
  ): Promise<GmailDraftReview> {
    return this.gmail.updateDraftReview(principal, reviewId, input);
  }

  @Post("draft-reviews/:reviewId/send")
  @HttpCode(HttpStatus.OK)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public sendDraftReview(
    @CurrentUser() principal: RequestPrincipal,
    @Param("reviewId", new ZodValidationPipe(uuidSchema)) reviewId: string
  ): Promise<GmailDraftReview> {
    return this.gmail.sendDraftReview(principal, reviewId);
  }

  @Post("draft-reviews/:reviewId/reject")
  @HttpCode(HttpStatus.OK)
  @Roles("OWNER", "ADMIN", "MEMBER")
  public rejectDraftReview(
    @CurrentUser() principal: RequestPrincipal,
    @Param("reviewId", new ZodValidationPipe(uuidSchema)) reviewId: string
  ): Promise<GmailDraftReview> {
    return this.gmail.rejectDraftReview(principal, reviewId);
  }
}
