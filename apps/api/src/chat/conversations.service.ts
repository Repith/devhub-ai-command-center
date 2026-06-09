import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type {
  Conversation,
  ConversationList,
  ConversationMessageList
} from "@devhub/contracts";
import type { PrismaConversationRepository } from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import { CONVERSATION_REPOSITORY } from "./chat.tokens";

@Injectable()
export class ConversationsService {
  public constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: PrismaConversationRepository
  ) {}

  public async list(principal: RequestPrincipal): Promise<ConversationList> {
    const records = await this.conversations.list(this.context(principal));
    return {
      data: records.map((record) =>
        this.conversations.toConversationResponse(record)
      ),
      page: { cursor: null, nextCursor: null, limit: 100 }
    };
  }

  public async findById(
    principal: RequestPrincipal,
    conversationId: string
  ): Promise<Conversation> {
    const record = await this.conversations.findById(
      this.context(principal),
      conversationId
    );
    if (!record) {
      throw new NotFoundException("Conversation was not found.");
    }
    return this.conversations.toConversationResponse(record);
  }

  public async messages(
    principal: RequestPrincipal,
    conversationId: string
  ): Promise<ConversationMessageList> {
    const records = await this.conversations.listMessages(
      this.context(principal),
      conversationId
    );
    if (!records) {
      throw new NotFoundException("Conversation was not found.");
    }
    return {
      data: records.map((record) => this.conversations.toResponse(record)),
      page: { cursor: null, nextCursor: null, limit: 100 }
    };
  }

  private context(principal: RequestPrincipal): TenantContext {
    return {
      tenantId: principal.tenantId,
      userId: principal.userId,
      correlationId: principal.sessionId
    };
  }
}
