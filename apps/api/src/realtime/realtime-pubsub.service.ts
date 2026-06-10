import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import Redis from "ioredis";

import { realtimeEventSchema, type RealtimeEvent } from "@devhub/contracts";

export const realtimeRedisChannel = "devhub:realtime:v1";

@Injectable()
export class RealtimeRedisSubscriber implements OnApplicationShutdown {
  private readonly redis: Redis;
  private subscribed = false;

  public constructor() {
    this.redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy: () => null
    });
    this.redis.on("error", () => {
      // The gateway still supports direct socket acks if Redis is unavailable.
    });
  }

  public async start(onEvent: (event: RealtimeEvent) => void): Promise<void> {
    if (this.subscribed) {
      return;
    }
    this.subscribed = true;
    this.redis.on("message", (_channel, message) => {
      try {
        const parsed = realtimeEventSchema.safeParse(JSON.parse(message));
        if (parsed.success) {
          onEvent(parsed.data);
        }
      } catch {
        // Ignore malformed bus messages; contracts protect the socket boundary.
      }
    });

    try {
      await this.redis.connect();
      await this.redis.subscribe(realtimeRedisChannel);
    } catch {
      this.subscribed = false;
    }
  }

  public async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
  }
}
