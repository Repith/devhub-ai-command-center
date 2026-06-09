import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AgentsModule } from "./agents/agents.module";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";

@Module({
  imports: [AgentsModule, AuthModule, ChatModule],
  controllers: [AppController]
})
export class AppModule {}
