import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AgentsModule } from "./agents/agents.module";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { DocumentsModule } from "./documents/documents.module";
import { GoldenModule } from "./golden/golden.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { RunsModule } from "./runs/runs.module";
import { UsageModule } from "./usage/usage.module";

@Module({
  imports: [
    AgentsModule,
    AuthModule,
    ChatModule,
    DocumentsModule,
    GoldenModule,
    RealtimeModule,
    RunsModule,
    UsageModule
  ],
  controllers: [AppController]
})
export class AppModule {}
