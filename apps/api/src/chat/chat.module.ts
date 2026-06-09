import { Module } from "@nestjs/common";

import { OllamaOpenAiProvider } from "@devhub/ai";
import { PrismaConversationRepository } from "@devhub/database";

import { AgentsModule } from "../agents/agents.module";
import { AuthModule } from "../auth/auth.module";
import { DATABASE_CLIENT } from "../database/database.module";
import { CHAT_CONFIG, loadChatConfig, type ChatConfig } from "./chat.config";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { CONVERSATION_REPOSITORY, LLM_PROVIDER } from "./chat.tokens";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";

@Module({
  imports: [AgentsModule, AuthModule],
  controllers: [ChatController, ConversationsController],
  providers: [
    { provide: CHAT_CONFIG, useFactory: loadChatConfig },
    {
      provide: LLM_PROVIDER,
      inject: [CHAT_CONFIG],
      useFactory: (config: ChatConfig): OllamaOpenAiProvider =>
        new OllamaOpenAiProvider({
          baseUrl: config.ollamaBaseUrl,
          apiKey: config.ollamaApiKey
        })
    },
    {
      provide: CONVERSATION_REPOSITORY,
      inject: [DATABASE_CLIENT],
      useFactory: (
        database: ConstructorParameters<typeof PrismaConversationRepository>[0]
      ): PrismaConversationRepository =>
        new PrismaConversationRepository(database)
    },
    ChatService,
    ConversationsService
  ],
  exports: [CHAT_CONFIG, CONVERSATION_REPOSITORY, LLM_PROVIDER]
})
export class ChatModule {}
