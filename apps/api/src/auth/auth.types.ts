import type { MembershipRole } from "@devhub/contracts";

export interface AccessTokenClaims {
  sub: string;
  tenantId: string;
  role: MembershipRole;
  sessionId: string;
}

export interface RequestPrincipal {
  userId: string;
  email: string;
  displayName: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: MembershipRole;
  sessionId: string;
}
