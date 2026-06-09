import {
  apiErrorSchema,
  type ApiError,
  type AccessTokenResponse
} from "@devhub/contracts";
import type { z } from "zod";

export class ApiClientError extends Error {
  public constructor(public readonly response: ApiError) {
    super(response.message);
    this.name = "ApiClientError";
  }
}

interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  accessToken?: string;
  body?: unknown;
}

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { accessToken, body, headers, ...requestOptions } = options;
  const response = await fetch(`/api/v1${path}`, {
    ...requestOptions,
    credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  if (!response.ok) {
    throw new ApiClientError(await parseApiError(response));
  }

  return schema.parse(await response.json());
}

export async function apiRequestEmpty(
  path: string,
  options: ApiRequestOptions = {}
): Promise<void> {
  const { accessToken, body, headers, ...requestOptions } = options;
  const response = await fetch(`/api/v1${path}`, {
    ...requestOptions,
    credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  if (!response.ok) {
    throw new ApiClientError(await parseApiError(response));
  }
}

export async function parseApiError(response: Response): Promise<ApiError> {
  const fallback: ApiError = {
    code: "HTTP_ERROR",
    message: `Request failed with status ${response.status}.`,
    details: {},
    correlationId: "unavailable"
  };

  try {
    return apiErrorSchema.parse(await response.json());
  } catch {
    return fallback;
  }
}

export type TokenResponse = AccessTokenResponse;
