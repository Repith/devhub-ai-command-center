import { Controller, Get, Inject, UseGuards } from "@nestjs/common";

import type { OllamaRuntimeStatus } from "@devhub/contracts";

import { AuthGuard } from "../auth/auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { OllamaService } from "./ollama.service";

@Controller("runtime/ollama")
@UseGuards(AuthGuard, RolesGuard)
export class OllamaController {
  public constructor(
    @Inject(OllamaService) private readonly ollama: OllamaService
  ) {}

  @Get("status")
  @Roles("OWNER", "ADMIN", "MEMBER")
  public status(): Promise<OllamaRuntimeStatus> {
    return this.ollama.status();
  }
}
