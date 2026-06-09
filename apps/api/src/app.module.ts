import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AgentsModule } from "./agents/agents.module";
import { AuthModule } from "./auth/auth.module";

@Module({
  imports: [AgentsModule, AuthModule],
  controllers: [AppController]
})
export class AppModule {}
