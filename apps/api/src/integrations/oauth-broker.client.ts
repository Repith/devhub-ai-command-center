import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ServiceUnavailableException
} from "@nestjs/common";

type Provider = "gmail" | "github";
interface BrokerGrant {
  provider: Provider;
  identity: string;
  tokens: Record<string, unknown>;
}
const verifiers = new Map<string, { verifier: string; expiresAt: number }>();

export function brokerConfigured(): boolean {
  return Boolean(process.env.OAUTH_BROKER_URL);
}

export function prepareBrokerOAuth(
  provider: Provider,
  state: string,
  redirectUri: string
): string {
  const verifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  verifiers.set(state, { verifier, expiresAt: Date.now() + 10 * 60_000 });
  const url = new URL(`${brokerUrl()}/api/v1/broker/authorize`);
  url.search = new URLSearchParams({
    provider,
    state,
    redirectUri,
    codeChallenge
  }).toString();
  return url.toString();
}

export async function redeemBrokerGrant(
  state: string,
  code: string
): Promise<BrokerGrant> {
  const pending = verifiers.get(state);
  verifiers.delete(state);
  if (!pending || pending.expiresAt < Date.now())
    throw new BadRequestException("OAuth broker session expired.");
  const response = await fetch(`${brokerUrl()}/api/v1/broker/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, codeVerifier: pending.verifier }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok)
    throw new BadRequestException("OAuth broker grant could not be redeemed.");
  return (await response.json()) as BrokerGrant;
}

function brokerUrl(): string {
  const value = process.env.OAUTH_BROKER_URL;
  if (!value)
    throw new ServiceUnavailableException("OAuth broker is not configured.");
  return value.replace(/\/$/, "");
}
