import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown
} from "@nestjs/common";

import { createDatabaseClient, type DatabaseClient } from "@devhub/database";

export const DATABASE_CLIENT = Symbol("DATABASE_CLIENT");

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: DatabaseClient
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.database.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CLIENT,
      useFactory: (): DatabaseClient => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error("DATABASE_URL is required.");
        }
        return createDatabaseClient(connectionString);
      }
    },
    DatabaseLifecycle
  ],
  exports: [DATABASE_CLIENT]
})
export class DatabaseModule {}
