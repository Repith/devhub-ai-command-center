import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res
} from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";

import {
  loginSchema,
  registerSchema,
  type AccessTokenResponse,
  type LoginInput,
  type RegisterInput
} from "@devhub/contracts";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  AUTH_CONFIG,
  type AuthConfig,
  REFRESH_COOKIE_NAME
} from "./auth.config";
import type { AuthService } from "./auth.service";
import { AUTH_SERVICE } from "./auth.tokens";

interface CookieRequest extends Request {
  cookies: Record<string, string | undefined>;
}

@Controller("auth")
export class AuthController {
  public constructor(
    @Inject(AUTH_SERVICE) private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig
  ) {}

  @Post("register")
  public async register(
    @Body(new ZodValidationPipe(registerSchema)) input: RegisterInput,
    @Res({ passthrough: true }) response: Response
  ): Promise<AccessTokenResponse> {
    const result = await this.auth.register(input);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  @HttpCode(HttpStatus.OK)
  @Post("login")
  public async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Res({ passthrough: true }) response: Response
  ): Promise<AccessTokenResponse> {
    const result = await this.auth.login(input);
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  public async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response
  ): Promise<AccessTokenResponse> {
    const result = await this.auth.refresh(
      request.cookies[REFRESH_COOKIE_NAME] ?? ""
    );
    this.setRefreshCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("logout")
  public async logout(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    await this.auth.logout(request.cookies[REFRESH_COOKIE_NAME]);
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  private setRefreshCookie(response: Response, token: string): void {
    response.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      maxAge: this.config.refreshTokenTtlSeconds * 1000
    });
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.refreshCookieSecure,
      sameSite: "strict",
      path: "/api/v1/auth"
    };
  }
}
