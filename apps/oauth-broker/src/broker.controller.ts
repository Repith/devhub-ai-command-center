import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { BrokerService } from "./broker.service";

const providerSchema = z.enum(["gmail", "github"]);
const startSchema = z
  .object({
    provider: providerSchema,
    redirectUri: z.url(),
    state: z.string().min(16).max(2048),
    codeChallenge: z.string().min(43).max(128)
  })
  .strict();
const redeemSchema = z
  .object({
    code: z.string().min(32),
    codeVerifier: z.string().min(43).max(128)
  })
  .strict();

@Controller("broker")
export class BrokerController {
  public constructor(
    @Inject(BrokerService) private readonly broker: BrokerService
  ) {}

  @Get("status")
  public status(): object {
    return this.broker.status();
  }

  @Post("start")
  public start(@Body() body: unknown): { authorizeUrl: string } {
    return this.broker.start(startSchema.parse(body));
  }

  @Get("authorize")
  public authorize(@Query() query: unknown, @Res() response: Response): void {
    const result = this.broker.start(startSchema.parse(query));
    response.redirect(303, result.authorizeUrl);
  }

  @Get("callback/:provider")
  public async callback(
    @Param("provider") providerValue: string,
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() response: Response
  ): Promise<void> {
    const redirect = await this.broker.callback(
      providerSchema.parse(providerValue),
      code,
      state
    );
    response.redirect(303, redirect);
  }

  @Post("redeem")
  public redeem(@Body() body: unknown): Promise<object> {
    return this.broker.redeem(redeemSchema.parse(body));
  }
}
