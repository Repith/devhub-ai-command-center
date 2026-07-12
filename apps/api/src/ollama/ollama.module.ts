import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { OllamaController } from "./ollama.controller";
import { OllamaService } from "./ollama.service";

@Module({
  imports: [AuthModule],
  controllers: [OllamaController],
  providers: [OllamaService]
})
export class OllamaModule {}
