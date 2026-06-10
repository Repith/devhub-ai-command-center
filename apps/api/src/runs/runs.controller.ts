import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";

import {
  createAgentRunSchema,
  uuidSchema,
  type AgentRun,
  type AgentRunList,
  type AgentRunSnapshot,
  type AgentRunStepList,
  type CreateAgentRun
} from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RunsService } from "./runs.service";

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class RunsController {
  public constructor(@Inject(RunsService) private readonly runs: RunsService) {}

  @Post("agents/:agentId/runs")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public start(
    @CurrentUser() principal: RequestPrincipal,
    @Param("agentId", new ZodValidationPipe(uuidSchema)) agentId: string,
    @Body(new ZodValidationPipe(createAgentRunSchema)) input: CreateAgentRun
  ): Promise<AgentRun> {
    return this.runs.start(principal, agentId, input);
  }

  @Get("runs")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public list(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<AgentRunList> {
    return this.runs.list(principal);
  }

  @Get("runs/:runId")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public get(
    @CurrentUser() principal: RequestPrincipal,
    @Param("runId", new ZodValidationPipe(uuidSchema)) runId: string
  ): Promise<AgentRunSnapshot> {
    return this.runs.get(principal, runId);
  }

  @Get("runs/:runId/steps")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public listSteps(
    @CurrentUser() principal: RequestPrincipal,
    @Param("runId", new ZodValidationPipe(uuidSchema)) runId: string
  ): Promise<AgentRunStepList> {
    return this.runs.listSteps(principal, runId);
  }

  @Post("runs/:runId/cancel")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public cancel(
    @CurrentUser() principal: RequestPrincipal,
    @Param("runId", new ZodValidationPipe(uuidSchema)) runId: string
  ): Promise<AgentRun> {
    return this.runs.cancel(principal, runId);
  }
}
