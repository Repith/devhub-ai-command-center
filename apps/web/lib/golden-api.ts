import {
  evaluationReportSchema,
  evaluationRunListSchema,
  evaluationRunSchema,
  goldenCaseListSchema,
  type EvaluationMode,
  type EvaluationReport,
  type EvaluationRun,
  type GoldenCase
} from "@devhub/contracts";

import { apiRequest } from "./api-client";

export async function listEvaluationRuns(
  accessToken: string
): Promise<readonly EvaluationRun[]> {
  const response = await apiRequest("/evaluations", evaluationRunListSchema, {
    accessToken
  });
  return response.data;
}

export async function startGoldenEvaluation(
  accessToken: string,
  mode: EvaluationMode
): Promise<EvaluationRun> {
  return apiRequest("/evaluations/golden-set", evaluationRunSchema, {
    accessToken,
    body: { mode },
    method: "POST"
  });
}

export async function getEvaluationReport(
  accessToken: string,
  evaluationRunId: string
): Promise<EvaluationReport> {
  return apiRequest(`/evaluations/${evaluationRunId}`, evaluationReportSchema, {
    accessToken
  });
}

export async function installSampleGoldenCases(
  accessToken: string
): Promise<readonly GoldenCase[]> {
  const response = await apiRequest(
    "/golden-cases/samples",
    goldenCaseListSchema,
    {
      accessToken,
      method: "POST"
    }
  );
  return response.data;
}
