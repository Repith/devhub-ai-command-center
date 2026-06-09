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
  createAgentDefinitionSchema,
  updateAgentDefinitionSchema,
  uuidSchema
} from "@devhub/contracts";
import type {
  AgentDefinition,
  AgentDefinitionList,
  CreateAgentDefinition,
  UpdateAgentDefinition
} from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AgentsService } from "./agents.service";

@Controller("agents")
@UseGuards(AuthGuard, RolesGuard)
export class AgentsController {
  public constructor(
    @Inject(AgentsService) private readonly agents: AgentsService
  ) {}

  @Get()
  @Roles("OWNER", "ADMIN", "MEMBER")
  public async list(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<AgentDefinitionList> {
    const data = await this.agents.list(principal);
    return {
      data,
      page: { cursor: null, nextCursor: null, limit: 100 }
    };
  }

  @Get(":agentId")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public findById(
    @CurrentUser() principal: RequestPrincipal,
    @Param("agentId", new ZodValidationPipe(uuidSchema)) agentId: string
  ): Promise<AgentDefinition> {
    return this.agents.findById(principal, agentId);
  }

  @Post()
  @Roles("OWNER", "ADMIN")
  public create(
    @CurrentUser() principal: RequestPrincipal,
    @Body(new ZodValidationPipe(createAgentDefinitionSchema))
    input: CreateAgentDefinition
  ): Promise<AgentDefinition> {
    return this.agents.create(principal, input);
  }

  @Patch(":agentId")
  @Roles("OWNER", "ADMIN")
  public update(
    @CurrentUser() principal: RequestPrincipal,
    @Param("agentId", new ZodValidationPipe(uuidSchema)) agentId: string,
    @Body(new ZodValidationPipe(updateAgentDefinitionSchema))
    input: UpdateAgentDefinition
  ): Promise<AgentDefinition> {
    return this.agents.update(principal, agentId, input);
  }

  @Delete(":agentId")
  @Roles("OWNER", "ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  public delete(
    @CurrentUser() principal: RequestPrincipal,
    @Param("agentId", new ZodValidationPipe(uuidSchema)) agentId: string
  ): Promise<void> {
    return this.agents.delete(principal, agentId);
  }
}
