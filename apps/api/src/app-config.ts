import cookieParser from "cookie-parser";
import type { INestApplication } from "@nestjs/common";

import { API_PREFIX } from "@devhub/contracts";

import { ApiExceptionFilter } from "./common/api-exception.filter";

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX.slice(1));
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}
