import { Controller, Get } from "@nestjs/common";

import type { ServiceStatus } from "@devhub/contracts";

@Controller("health")
export class AppController {
  @Get()
  getHealth(): ServiceStatus {
    return {
      name: "api",
      status: "ok"
    };
  }
}
