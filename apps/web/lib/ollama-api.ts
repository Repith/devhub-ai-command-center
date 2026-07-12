import {
  ollamaRuntimeStatusSchema,
  type OllamaRuntimeStatus
} from "@devhub/contracts";

import { apiRequest } from "./api-client";

export function getOllamaStatus(
  accessToken: string
): Promise<OllamaRuntimeStatus> {
  return apiRequest("/runtime/ollama/status", ollamaRuntimeStatusSchema, {
    accessToken
  });
}
