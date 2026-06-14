import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Request, Response } from "express";

import { LlmProviderError } from "@devhub/ai";
import {
  createChatMessageSchema,
  uuidSchema,
  type ChatStreamEvent,
  type CreateChatMessage
} from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ChatService } from "./chat.service";

@Controller("agents")
@UseGuards(AuthGuard, RolesGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  public constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Post(":agentId/chat")
  @Roles("OWNER", "ADMIN", "MEMBER")
  @HttpCode(HttpStatus.OK)
  public async stream(
    @CurrentUser() principal: RequestPrincipal,
    @Param("agentId", new ZodValidationPipe(uuidSchema)) agentId: string,
    @Body(new ZodValidationPipe(createChatMessageSchema))
    input: CreateChatMessage,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const prepared = await this.chat.prepare(principal, agentId, input);
    const abortController = new AbortController();
    const cancel = (): void => {
      if (!response.writableEnded) {
        abortController.abort(new Error("Client disconnected."));
      }
    };
    response.once("close", cancel);
    request.once("aborted", cancel);

    response.status(HttpStatus.OK);
    response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-store");
    response.setHeader("Deprecation", "true");
    response.setHeader(
      "Link",
      '</api/v1/agents/{agentId}/runs>; rel="successor-version"'
    );
    response.setHeader("X-DevHub-Compatibility-Path", "direct-chat");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    await this.write(response, prepared.started);

    try {
      for await (const event of prepared.events(abortController.signal)) {
        await this.write(response, event);
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        const event = this.toErrorEvent(error);
        this.logger.error(
          `${event.code} for tenant ${principal.tenantId}, agent ${agentId}`
        );
        await this.write(response, event);
      }
    } finally {
      response.off("close", cancel);
      request.off("aborted", cancel);
      if (!response.writableEnded) {
        response.end();
      }
    }
  }

  private async write(
    response: Response,
    event: ChatStreamEvent
  ): Promise<void> {
    if (!response.write(`${JSON.stringify(event)}\n`)) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
          response.off("drain", onDrain);
          response.off("close", onClose);
        };
        const onDrain = (): void => {
          cleanup();
          resolve();
        };
        const onClose = (): void => {
          cleanup();
          reject(new Error("Client disconnected during stream write."));
        };
        response.once("drain", onDrain);
        response.once("close", onClose);
      });
    }
  }

  private toErrorEvent(
    error: unknown
  ): Extract<ChatStreamEvent, { type: "chat.error" }> {
    if (error instanceof LlmProviderError) {
      return {
        version: 1,
        type: "chat.error",
        code: error.code,
        message: error.message
      };
    }
    return {
      version: 1,
      type: "chat.error",
      code: "CHAT_GENERATION_FAILED",
      message: "The assistant response could not be completed."
    };
  }
}
