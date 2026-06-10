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
  createGoldenCaseSchema,
  startGoldenEvaluationSchema,
  updateGoldenCaseSchema,
  uuidSchema,
  type CreateGoldenCase,
  type EvaluationReport,
  type EvaluationRun,
  type EvaluationRunList,
  type GoldenCase,
  type GoldenCaseList,
  type StartGoldenEvaluation,
  type UpdateGoldenCase
} from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { GoldenService } from "./golden.service";

@Controller()
@UseGuards(AuthGuard, RolesGuard)
export class GoldenController {
  public constructor(
    @Inject(GoldenService) private readonly golden: GoldenService
  ) {}

  @Get("golden-cases")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public listCases(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<GoldenCaseList> {
    return this.golden.listCases(principal);
  }

  @Get("golden-cases/:caseId")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public findCaseById(
    @CurrentUser() principal: RequestPrincipal,
    @Param("caseId", new ZodValidationPipe(uuidSchema)) caseId: string
  ): Promise<GoldenCase> {
    return this.golden.findCaseById(principal, caseId);
  }

  @Post("golden-cases")
  @Roles("OWNER", "ADMIN")
  public createCase(
    @CurrentUser() principal: RequestPrincipal,
    @Body(new ZodValidationPipe(createGoldenCaseSchema)) input: CreateGoldenCase
  ): Promise<GoldenCase> {
    return this.golden.createCase(principal, input);
  }

  @Patch("golden-cases/:caseId")
  @Roles("OWNER", "ADMIN")
  public updateCase(
    @CurrentUser() principal: RequestPrincipal,
    @Param("caseId", new ZodValidationPipe(uuidSchema)) caseId: string,
    @Body(new ZodValidationPipe(updateGoldenCaseSchema)) input: UpdateGoldenCase
  ): Promise<GoldenCase> {
    return this.golden.updateCase(principal, caseId, input);
  }

  @Delete("golden-cases/:caseId")
  @Roles("OWNER", "ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  public deleteCase(
    @CurrentUser() principal: RequestPrincipal,
    @Param("caseId", new ZodValidationPipe(uuidSchema)) caseId: string
  ): Promise<void> {
    return this.golden.deleteCase(principal, caseId);
  }

  @Post("evaluations/golden-set")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public startEvaluation(
    @CurrentUser() principal: RequestPrincipal,
    @Body(new ZodValidationPipe(startGoldenEvaluationSchema))
    input: StartGoldenEvaluation
  ): Promise<EvaluationRun> {
    void input;
    return this.golden.startEvaluation(principal);
  }

  @Get("evaluations")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public listEvaluationRuns(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<EvaluationRunList> {
    return this.golden.listEvaluationRuns(principal);
  }

  @Get("evaluations/:evaluationRunId")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public getEvaluationReport(
    @CurrentUser() principal: RequestPrincipal,
    @Param("evaluationRunId", new ZodValidationPipe(uuidSchema))
    evaluationRunId: string
  ): Promise<EvaluationReport> {
    return this.golden.getEvaluationReport(principal, evaluationRunId);
  }
}
