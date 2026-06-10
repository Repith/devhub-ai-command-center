import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { RunsModule } from "../runs/runs.module";
import { RealtimeGateway } from "./realtime.gateway";
import { RealtimeRedisSubscriber } from "./realtime-pubsub.service";

@Module({
  imports: [AuthModule, RunsModule],
  providers: [RealtimeGateway, RealtimeRedisSubscriber]
})
export class RealtimeModule {}
