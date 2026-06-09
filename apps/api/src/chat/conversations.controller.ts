import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";

import {
  uuidSchema,
  type Conversation,
  type ConversationList,
  type ConversationMessageList
} from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import type { RequestPrincipal } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ConversationsService } from "./conversations.service";

@Controller("conversations")
@UseGuards(AuthGuard, RolesGuard)
@Roles("OWNER", "ADMIN", "MEMBER")
export class ConversationsController {
  public constructor(
    @Inject(ConversationsService)
    private readonly conversations: ConversationsService
  ) {}

  @Get()
  public list(
    @CurrentUser() principal: RequestPrincipal
  ): Promise<ConversationList> {
    return this.conversations.list(principal);
  }

  @Get(":conversationId")
  public findById(
    @CurrentUser() principal: RequestPrincipal,
    @Param("conversationId", new ZodValidationPipe(uuidSchema))
    conversationId: string
  ): Promise<Conversation> {
    return this.conversations.findById(principal, conversationId);
  }

  @Get(":conversationId/messages")
  public messages(
    @CurrentUser() principal: RequestPrincipal,
    @Param("conversationId", new ZodValidationPipe(uuidSchema))
    conversationId: string
  ): Promise<ConversationMessageList> {
    return this.conversations.messages(principal, conversationId);
  }
}
