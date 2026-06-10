import cookieParser from "cookie-parser";
import type { INestApplication } from "@nestjs/common";

import { API_PREFIX } from "@devhub/contracts";

import { ApiExceptionFilter } from "./common/api-exception.filter";
import {
  createRateLimitMiddleware,
  loadRateLimitConfig
} from "./common/rate-limit.middleware";
import { requestLoggingMiddleware } from "./common/request-logging.middleware";
import { securityHeadersMiddleware } from "./common/security-headers.middleware";

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX.slice(1));
  app.use(securityHeadersMiddleware);
  app.use(requestLoggingMiddleware);
  app.use(createRateLimitMiddleware(loadRateLimitConfig()));
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
}
