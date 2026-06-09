import type {
  ChatUsage,
  Conversation,
  ConversationMessage,
  MessageRole
} from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";

import type { DatabaseClient } from "./client.js";

export interface ConversationRecord {
  id: string;
  tenantId: string;
  agentId: string | null;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessageRecord {
  id: string;
  tenantId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  sequence: number;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  createdAt: Date;
}

export interface StartedConversation {
  conversation: ConversationRecord;
  userMessage: ConversationMessageRecord;
  history: readonly ConversationMessageRecord[];
}

export class PrismaConversationRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public async list(
    context: TenantContext
  ): Promise<readonly ConversationRecord[]> {
    return this.database.conversation.findMany({
      where: { tenantId: context.tenantId, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 100
    });
  }

  public async findById(
    context: TenantContext,
    conversationId: string
  ): Promise<ConversationRecord | null> {
    return this.database.conversation.findFirst({
      where: {
        id: conversationId,
        tenantId: context.tenantId,
        deletedAt: null
      }
    });
  }

  public async listMessages(
    context: TenantContext,
    conversationId: string
  ): Promise<readonly ConversationMessageRecord[] | null> {
    const conversation = await this.findById(context, conversationId);
    if (!conversation) {
      return null;
    }
    return this.database.message.findMany({
      where: { tenantId: context.tenantId, conversationId },
      orderBy: { sequence: "asc" },
      take: 100
    });
  }

  public async start(
    context: TenantContext,
    agentId: string,
    content: string,
    conversationId?: string
  ): Promise<StartedConversation | null> {
    if (!conversationId) {
      const conversation = await this.database.conversation.create({
        data: {
          tenantId: context.tenantId,
          agentId,
          title: titleFrom(content),
          messages: {
            create: {
              role: "USER",
              content,
              sequence: 1
            }
          }
        },
        include: { messages: true }
      });
      const userMessage = conversation.messages[0];
      if (!userMessage) {
        throw new Error(
          "Conversation creation did not return its user message."
        );
      }
      return {
        conversation,
        userMessage,
        history: [userMessage]
      };
    }

    return this.database.$transaction(async (transaction) => {
      const locked = await transaction.conversation.updateMany({
        where: {
          id: conversationId,
          tenantId: context.tenantId,
          agentId,
          deletedAt: null
        },
        data: { updatedAt: new Date() }
      });
      if (locked.count !== 1) {
        return null;
      }
      const conversation = await transaction.conversation.findFirst({
        where: {
          id: conversationId,
          tenantId: context.tenantId,
          agentId,
          deletedAt: null
        }
      });
      if (!conversation) {
        return null;
      }

      const history = await transaction.message.findMany({
        where: { tenantId: context.tenantId, conversationId },
        orderBy: { sequence: "asc" }
      });
      const sequence = (history.at(-1)?.sequence ?? 0) + 1;
      const userMessage = await transaction.message.create({
        data: {
          tenantId: context.tenantId,
          conversationId,
          role: "USER",
          content,
          sequence
        }
      });

      return {
        conversation,
        userMessage,
        history: [...history, userMessage]
      };
    });
  }

  public async complete(
    context: TenantContext,
    conversationId: string,
    agentId: string,
    content: string,
    usage: ChatUsage
  ): Promise<ConversationMessageRecord | null> {
    return this.database.$transaction(async (transaction) => {
      const locked = await transaction.conversation.updateMany({
        where: {
          id: conversationId,
          tenantId: context.tenantId,
          agentId,
          deletedAt: null
        },
        data: { updatedAt: new Date() }
      });
      if (locked.count !== 1) {
        return null;
      }
      const conversation = await transaction.conversation.findFirst({
        where: {
          id: conversationId,
          tenantId: context.tenantId,
          agentId,
          deletedAt: null
        }
      });
      if (!conversation) {
        return null;
      }

      const latest = await transaction.message.findFirst({
        where: { tenantId: context.tenantId, conversationId },
        orderBy: { sequence: "desc" }
      });
      const assistantMessage = await transaction.message.create({
        data: {
          tenantId: context.tenantId,
          conversationId,
          role: "ASSISTANT",
          content,
          sequence: (latest?.sequence ?? 0) + 1,
          provider: usage.provider,
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          durationMs: usage.durationMs
        }
      });
      return assistantMessage;
    });
  }

  public toResponse(message: ConversationMessageRecord): ConversationMessage {
    return {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      sequence: message.sequence,
      provider: message.provider,
      model: message.model,
      inputTokens: message.inputTokens,
      outputTokens: message.outputTokens,
      durationMs: message.durationMs,
      createdAt: message.createdAt.toISOString()
    };
  }

  public toConversationResponse(
    conversation: ConversationRecord
  ): Conversation {
    return {
      id: conversation.id,
      agentId: conversation.agentId,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString()
    };
  }
}

function titleFrom(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 120);
}
