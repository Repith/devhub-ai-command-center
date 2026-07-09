import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

interface GithubOAuthStatePayload {
  tenantId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
}

export class GithubOAuthStateService {
  public sign(secret: string, tenantId: string, userId: string): string {
    const payload: GithubOAuthStatePayload = {
      tenantId,
      userId,
      nonce: randomUUID(),
      issuedAt: Date.now()
    };
    const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url"
    );
    return `${body}.${signature(secret, body)}`;
  }

  public verify(
    secret: string,
    state: string,
    tenantId: string,
    userId: string
  ): void {
    const [body, providedSignature] = state.split(".");
    if (!body || !providedSignature) {
      throw new Error("OAuth state is malformed.");
    }
    const expectedSignature = signature(secret, body);
    if (!equal(providedSignature, expectedSignature)) {
      throw new Error("OAuth state signature is invalid.");
    }
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    ) as GithubOAuthStatePayload;
    if (payload.tenantId !== tenantId || payload.userId !== userId) {
      throw new Error("OAuth state does not match the active principal.");
    }
    if (Date.now() - payload.issuedAt > 10 * 60 * 1000) {
      throw new Error("OAuth state expired.");
    }
  }
}

function signature(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function equal(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
