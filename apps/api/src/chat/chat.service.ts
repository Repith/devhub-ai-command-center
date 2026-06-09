import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import type { LlmMessage, LlmProviderPort, LlmStreamEvent } from "@devhub/ai";
import type {
  ChatStreamEvent,
  ChatUsage,
  CreateChatMessage
} from "@devhub/contracts";
import type {
  PrismaAgentDefinitionRepository,
  PrismaConversationRepository
} from "@devhub/database";
import type { TenantContext } from "@devhub/domain";

import type { RequestPrincipal } from "../auth/auth.types";
import { AGENT_DEFINITION_REPOSITORY } from "../agents/agents.tokens";
import type { ChatConfig } from "./chat.config";
import { CHAT_CONFIG } from "./chat.config";
import { CONVERSATION_REPOSITORY, LLM_PROVIDER } from "./chat.tokens";

export interface PreparedChat {
  started: ChatStreamEvent;
  events(signal: AbortSignal): AsyncIterable<ChatStreamEvent>;
}

@Injectable()
export class ChatService {
  public constructor(
    @Inject(AGENT_DEFINITION_REPOSITORY)
    private readonly agents: PrismaAgentDefinitionRepository,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: PrismaConversationRepository,
    @Inject(LLM_PROVIDER) private readonly provider: LlmProviderPort,
    @Inject(CHAT_CONFIG) private readonly config: ChatConfig
  ) {}

  public async prepare(
    principal: RequestPrincipal,
    agentId: string,
    input: CreateChatMessage
  ): Promise<PreparedChat> {
    const context = this.context(principal);
    const agent = await this.agents.findById(context, agentId);
    if (!agent) {
      throw new NotFoundException("Agent definition was not found.");
    }
    if (agent.provider !== "ollama") {
      throw new NotFoundException(
        `No chat provider is configured for ${agent.provider}.`
      );
    }

    const started = await this.conversations.start(
      context,
      agentId,
      input.message,
      input.conversationId
    );
    if (!started) {
      throw new NotFoundException("Conversation was not found.");
    }

    const startedEvent: ChatStreamEvent = {
      version: 1,
      type: "chat.started",
      conversationId: started.conversation.id,
      userMessage: this.conversations.toResponse(started.userMessage)
    };
    const messages: LlmMessage[] = [
      { role: "system", content: agent.systemPrompt },
      ...started.history.map((message) => ({
        role:
          message.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: message.content
      }))
    ];
    const model = agent.model || this.config.defaultModel;

    return {
      started: startedEvent,
      events: (signal) =>
        this.generate(
          context,
          started.conversation.id,
          agentId,
          model,
          messages,
          agent.maxTokens ?? undefined,
          agent.timeoutMs,
          signal
        )
    };
  }

  private async *generate(
    context: TenantContext,
    conversationId: string,
    agentId: string,
    model: string,
    messages: readonly LlmMessage[],
    maxTokens: number | undefined,
    timeoutMs: number,
    signal: AbortSignal
  ): AsyncIterable<ChatStreamEvent> {
    const startedAt = performance.now();
    let content = "";
    let completed: Extract<LlmStreamEvent, { type: "completed" }> | undefined;

    for await (const event of this.provider.streamChat({
      model,
      messages,
      timeoutMs,
      signal,
      ...(maxTokens === undefined ? {} : { maxTokens })
    })) {
      if (event.type === "delta") {
        content += event.text;
        yield { version: 1, type: "chat.delta", text: event.text };
      } else {
        completed = event;
      }
    }

    if (!completed) {
      throw new Error("The model stream ended without completion metadata.");
    }

    const usage: ChatUsage = {
      provider: this.provider.name,
      model,
      inputTokens: completed.usage.inputTokens,
      outputTokens: completed.usage.outputTokens,
      durationMs: Math.round(performance.now() - startedAt)
    };
    const assistantMessage = await this.conversations.complete(
      context,
      conversationId,
      agentId,
      content,
      usage
    );
    if (!assistantMessage) {
      throw new Error("Conversation disappeared before completion.");
    }

    yield {
      version: 1,
      type: "chat.completed",
      assistantMessage: this.conversations.toResponse(assistantMessage),
      usage
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
