import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AgentsModule } from "./agents/agents.module";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { DocumentsModule } from "./documents/documents.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [
    AgentsModule,
    AuthModule,
    ChatModule,
    DocumentsModule,
    RealtimeModule
  ],
  controllers: [AppController]
})
export class AppModule {}
