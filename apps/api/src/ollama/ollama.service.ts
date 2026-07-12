import { Injectable } from "@nestjs/common";

import type { OllamaRuntimeStatus } from "@devhub/contracts";

interface OpenAiModelList {
  data?: readonly { id?: unknown }[];
}

@Injectable()
export class OllamaService {
  public async status(): Promise<OllamaRuntimeStatus> {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
    const configuredModel = process.env.OLLAMA_CHAT_MODEL ?? "qwen3:8b";
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
        headers: {
          Authorization: `Bearer ${process.env.OLLAMA_API_KEY ?? "ollama"}`
        },
        signal: AbortSignal.timeout(3_000)
      });
      if (!response.ok) {
        return unavailable(
          baseUrl,
          configuredModel,
          `OLLAMA_HTTP_${response.status}`
        );
      }
      const body = (await response.json()) as OpenAiModelList;
      const models = (body.data ?? [])
        .map((model) => model.id)
        .filter((id): id is string => typeof id === "string")
        .toSorted();
      return {
        available: true,
        baseUrl,
        configuredModel,
        configuredModelAvailable: models.includes(configuredModel),
        models,
        errorCode: null
      };
    } catch {
      return unavailable(baseUrl, configuredModel, "OLLAMA_UNREACHABLE");
    }
  }
}

function unavailable(
  baseUrl: string,
  configuredModel: string,
  errorCode: string
): OllamaRuntimeStatus {
  return {
    available: false,
    baseUrl,
    configuredModel,
    configuredModelAvailable: false,
    models: [],
    errorCode
  };
}
