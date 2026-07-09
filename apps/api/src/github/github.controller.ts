import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards
} from "@nestjs/common";

import {
  githubOAuthCallbackSchema,
  type GithubConnectResponse,
  type GithubConnectionStatus,
  type GithubOAuthCallback,
  type GithubRepositoryList
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
