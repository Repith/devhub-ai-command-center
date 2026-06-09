import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { API_PREFIX } from "@devhub/contracts";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix(API_PREFIX.slice(1));

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
