import { SetMetadata } from "@nestjs/common";

import type { MembershipRole } from "@devhub/contracts";

export const ROLES_METADATA = "auth:roles";
export const Roles = (
  ...roles: readonly MembershipRole[]
): ReturnType<typeof SetMetadata> => SetMetadata(ROLES_METADATA, roles);
