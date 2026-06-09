import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

import type { RequestPrincipal } from "./auth.types";

interface AuthenticatedRequest extends Request {
  principal?: RequestPrincipal;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) {
      throw new Error("Authenticated principal is missing.");
    }
    return request.principal;
  }
);
