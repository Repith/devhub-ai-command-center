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
  Put,
  UseGuards
} from "@nestjs/common";

import {
  createAgentDefinitionSchema,
  saveAgentWorkflowSchema,
  updateAgentDefinitionSchema,
  uuidSchema
} from "@devhub/contracts";
import type {
  AgentDefinition,
  AgentDefinitionList,
  AgentTemplateList,
  AgentWorkflowResponse,
  AgentWorkflowValidationResponse,
  CreateAgentDefinition,
  InstallAgentTemplatesResponse,
  SaveAgentWorkflow,
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

  @Get("templates")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public listTemplates(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<AgentTemplateList> {
    return this.agents.listTemplates(principal);
  }

  @Post("templates/install")
  @Roles("OWNER", "ADMIN")
  public installTemplates(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<InstallAgentTemplatesResponse> {
    return this.agents.installTemplates(principal);
  }

  @Post("templates/reset")
  @Roles("OWNER", "ADMIN")
  public resetTemplates(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<InstallAgentTemplatesResponse> {
    return this.agents.resetTemplates(principal);
  }

  @Get(":agentId")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public findById(
    @CurrentUser() principal: RequestPrincipal,
    @Param("agentId", new ZodValidationPipe(uuidSchema)) agentId: string
  ): Promise<AgentDefinition> {
    return this.agents.findById(principal, agentId);
  }

  @Get(":agentId/workflow")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public getWorkflow(
    @CurrentUser() principal: RequestPrincipal,
    @Param("agentId", new ZodValidationPipe(uuidSchema)) agentId: string
  ): Promise<AgentWorkflowResponse> {
    return this.agents.getWorkflow(principal, agentId);
  }

  @Post(":agentId/workflow/validate")
  @Roles("OWNER", "ADMIN")
  @HttpCode(HttpStatus.OK)
  public validateWorkflow(
    @CurrentUser() principal: RequestPrincipal,
    @Param("agentId", new ZodValidationPipe(uuidSchema)) agentId: string,
    @Body() input: unknown
  ): Promise<AgentWorkflowValidationResponse> {
    return this.agents.validateWorkflow(principal, agentId, input);
  }

  @Put(":agentId/workflow")
  @Roles("OWNER", "ADMIN")
  public saveWorkflow(
    @CurrentUser() principal: RequestPrincipal,
    @Param("agentId", new ZodValidationPipe(uuidSchema)) agentId: string,
    @Body(new ZodValidationPipe(saveAgentWorkflowSchema))
    input: SaveAgentWorkflow
  ): Promise<AgentWorkflowResponse> {
    return this.agents.saveWorkflow(principal, agentId, input.definition);
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
