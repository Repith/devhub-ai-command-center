import { randomUUID } from "node:crypto";

import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter
} from "@nestjs/common";
import type { Request, Response } from "express";

interface ErrorBody {
  code?: string;
  message?: string;
  issues?: unknown;
}

const ERROR_CODES: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "BAD_REQUEST",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT"
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.getBody(exception);
    const correlationId =
      request.header("x-correlation-id")?.slice(0, 128) ?? randomUUID();

    response.status(status).json({
      code: body.code ?? ERROR_CODES[status] ?? "INTERNAL_SERVER_ERROR",
      message: body.message ?? this.defaultMessage(status),
      details: body.issues ? { issues: body.issues } : {},
      correlationId
    });
  }

  private getBody(exception: unknown): ErrorBody {
    if (!(exception instanceof HttpException)) {
      return {};
    }
    const response = exception.getResponse();
    if (typeof response === "string") {
      return { message: response };
    }
    return response as ErrorBody;
  }

  private defaultMessage(status: number): string {
    return status === HttpStatus.INTERNAL_SERVER_ERROR
      ? "An internal error occurred."
      : "The request could not be completed.";
  }
}
