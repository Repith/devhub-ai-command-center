import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";

type Provider = "gmail" | "github";
interface Pending {
  provider: Provider;
  redirectUri: string;
  clientState: string;
  challenge: string;
  expiresAt: number;
}
interface Grant {
  provider: Provider;
  challenge: string;
  tokens: Record<string, unknown>;
  identity: string;
  expiresAt: number;
}

@Injectable()
export class BrokerService {
  private readonly pending = new Map<string, Pending>();
  private readonly grants = new Map<string, Grant>();

  public status(): object {
    return {
      configured: this.configured("gmail") && this.configured("github"),
      providers: {
        gmail: this.configured("gmail"),
        github: this.configured("github")
      }
    };
  }

  public start(input: {
    provider: Provider;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): { authorizeUrl: string } {
    this.requireConfigured(input.provider);
    this.requireRedirect(input.redirectUri);
    this.prune();
    const brokerState = randomBytes(32).toString("base64url");
    this.pending.set(brokerState, {
      provider: input.provider,
      redirectUri: input.redirectUri,
      clientState: input.state,
      challenge: input.codeChallenge,
      expiresAt: Date.now() + 10 * 60_000
    });
    const callback = `${this.origin()}/api/v1/broker/callback/${input.provider}`;
    const url =
      input.provider === "gmail"
        ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
        : new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", this.clientId(input.provider));
    url.searchParams.set("redirect_uri", callback);
    url.searchParams.set("state", brokerState);
    if (input.provider === "gmail") {
      url.searchParams.set("response_type", "code");
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set(
        "scope",
        "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose"
      );
    } else {
      url.searchParams.set("scope", "read:user user:email");
    }
    return { authorizeUrl: url.toString() };
  }

  public async callback(
    provider: Provider,
    code: string,
    state: string
  ): Promise<string> {
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (
      !pending ||
      pending.expiresAt < Date.now() ||
      pending.provider !== provider
    ) {
      throw new BadRequestException("OAuth state is invalid or expired.");
    }
    const tokens = await this.exchange(provider, code);
    const identity = await this.identity(
      provider,
      String(tokens.access_token ?? "")
    );
    if (!this.allowed(provider, identity)) {
      throw new ForbiddenException("This provider account is not allowlisted.");
    }
    const grantCode = `${randomUUID()}${randomBytes(16).toString("hex")}`;
    this.grants.set(grantCode, {
      provider,
      challenge: pending.challenge,
      tokens,
      identity,
      expiresAt: Date.now() + 2 * 60_000
    });
    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("code", grantCode);
    redirect.searchParams.set("state", pending.clientState);
    return redirect.toString();
  }

  public async redeem(input: {
    code: string;
    codeVerifier: string;
  }): Promise<object> {
    const grant = this.grants.get(input.code);
    this.grants.delete(input.code);
    if (!grant || grant.expiresAt < Date.now())
      throw new BadRequestException("Grant is invalid or expired.");
    const challenge = createHash("sha256")
      .update(input.codeVerifier)
      .digest("base64url");
    if (challenge !== grant.challenge)
      throw new BadRequestException("PKCE verification failed.");
    return {
      provider: grant.provider,
      identity: grant.identity,
      tokens: grant.tokens
    };
  }

  private async exchange(
    provider: Provider,
    code: string
  ): Promise<Record<string, unknown>> {
    const callback = `${this.origin()}/api/v1/broker/callback/${provider}`;
    const endpoint =
      provider === "gmail"
        ? "https://oauth2.googleapis.com/token"
        : "https://github.com/login/oauth/access_token";
    const body = new URLSearchParams({
      client_id: this.clientId(provider),
      client_secret: this.clientSecret(provider),
      code,
      redirect_uri: callback,
      grant_type: "authorization_code"
    });
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body,
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok)
      throw new BadRequestException("Provider token exchange failed.");
    return (await response.json()) as Record<string, unknown>;
  }

  private async identity(provider: Provider, token: string): Promise<string> {
    const endpoint =
      provider === "gmail"
        ? "https://openidconnect.googleapis.com/v1/userinfo"
        : "https://api.github.com/user";
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "DevHub-OAuth-Broker"
      },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok)
      throw new BadRequestException("Provider identity lookup failed.");
    const body = (await response.json()) as {
      email?: unknown;
      login?: unknown;
    };
    const identity = provider === "gmail" ? body.email : body.login;
    if (typeof identity !== "string")
      throw new BadRequestException("Provider identity is missing.");
    return identity.toLowerCase();
  }

  private configured(provider: Provider): boolean {
    return Boolean(
      this.clientId(provider) &&
      this.clientSecret(provider) &&
      process.env.OAUTH_BROKER_PUBLIC_ORIGIN
    );
  }
  private requireConfigured(provider: Provider): void {
    if (!this.configured(provider))
      throw new ServiceUnavailableException(
        `${provider} broker is not configured.`
      );
  }
  private clientId(provider: Provider): string {
    return (
      process.env[
        provider === "gmail" ? "GOOGLE_CLIENT_ID" : "GITHUB_CLIENT_ID"
      ] ?? ""
    );
  }
  private clientSecret(provider: Provider): string {
    return (
      process.env[
        provider === "gmail" ? "GOOGLE_CLIENT_SECRET" : "GITHUB_CLIENT_SECRET"
      ] ?? ""
    );
  }
  private origin(): string {
    return (
      process.env.OAUTH_BROKER_PUBLIC_ORIGIN ?? "http://localhost:4100"
    ).replace(/\/$/, "");
  }
  private allowed(provider: Provider, identity: string): boolean {
    return (
      process.env[
        provider === "gmail" ? "GOOGLE_ALLOWED_EMAILS" : "GITHUB_ALLOWED_LOGINS"
      ] ?? ""
    )
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .includes(identity);
  }
  private requireRedirect(value: string): void {
    const url = new URL(value);
    const allowed = (
      process.env.OAUTH_BROKER_ALLOWED_REDIRECT_ORIGINS ??
      "http://localhost:3000"
    ).split(",");
    if (!allowed.includes(url.origin))
      throw new BadRequestException("Redirect origin is not allowed.");
  }
  private prune(): void {
    const now = Date.now();
    for (const [key, value] of this.pending)
      if (value.expiresAt < now) this.pending.delete(key);
    for (const [key, value] of this.grants)
      if (value.expiresAt < now) this.grants.delete(key);
  }
}
