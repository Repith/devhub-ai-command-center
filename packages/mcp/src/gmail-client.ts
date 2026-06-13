import type {
  GmailDraftMutationOutput,
  GmailGetThreadOutput,
  GmailThreadMessage,
  GmailThreadSummary
} from "@devhub/contracts";

export interface GmailMessageInput {
  threadId?: string;
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  body: string;
}

export interface GmailRestClientOptions {
  accessToken: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

interface GmailListThreadsResponse {
  threads?: { id?: string; threadId?: string }[];
}

interface GmailThreadResponse {
  id?: string;
  historyId?: string;
  messages?: GmailApiMessage[];
}

interface GmailDraftResponse {
  id?: string;
  message?: {
    id?: string;
    threadId?: string;
  };
}

interface GmailApiMessage {
  id?: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: {
    headers?: { name?: string; value?: string }[];
    mimeType?: string;
    body?: { data?: string };
    parts?: GmailApiMessage["payload"][];
  };
}

export class GmailRestClient {
  private readonly request: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  public constructor(private readonly options: GmailRestClientOptions) {
    this.request = options.fetch ?? fetch;
    this.baseUrl =
      options.baseUrl ?? "https://gmail.googleapis.com/gmail/v1/users/me";
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  public async searchThreads(
    query: string,
    maxResults: number
  ): Promise<readonly GmailThreadSummary[]> {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(maxResults)
    });
    const listed = await this.getJson<GmailListThreadsResponse>(
      `/threads?${params.toString()}`
    );
    const threads = listed.threads ?? [];
    return Promise.all(
      threads
        .flatMap((thread) => (thread.id ? [thread.id] : []))
        .map((threadId) => this.threadSummary(threadId))
    );
  }

  public async getThread(threadId: string): Promise<GmailGetThreadOutput> {
    const thread = await this.getJson<GmailThreadResponse>(
      `/threads/${encodeURIComponent(threadId)}?format=full`
    );
    return {
      id: thread.id ?? threadId,
      messages: (thread.messages ?? []).slice(0, 50).map(toThreadMessage)
    };
  }

  public async createDraft(
    input: GmailMessageInput
  ): Promise<GmailDraftMutationOutput> {
    const draft = await this.postJson<GmailDraftResponse>("/drafts", {
      message: {
        ...(input.threadId ? { threadId: input.threadId } : {}),
        raw: toGmailRawMessage(input)
      }
    });
    return toDraftOutput(draft);
  }

  public async updateDraft(
    draftId: string,
    input: GmailMessageInput
  ): Promise<GmailDraftMutationOutput> {
    const draft = await this.putJson<GmailDraftResponse>(
      `/drafts/${encodeURIComponent(draftId)}`,
      {
        message: {
          ...(input.threadId ? { threadId: input.threadId } : {}),
          raw: toGmailRawMessage(input)
        }
      }
    );
    return toDraftOutput(draft, draftId);
  }

  public async sendDraft(draftId: string): Promise<GmailDraftMutationOutput> {
    const draft = await this.postJson<GmailDraftResponse>("/drafts/send", {
      id: draftId
    });
    return toDraftOutput(draft, draftId);
  }

  private async threadSummary(threadId: string): Promise<GmailThreadSummary> {
    const thread = await this.getJson<GmailThreadResponse>(
      `/threads/${encodeURIComponent(threadId)}?format=metadata`
    );
    return {
      id: thread.id ?? threadId,
      snippet: (thread.messages?.[0]?.snippet ?? "").slice(0, 500),
      historyId: thread.historyId ?? null
    };
  }

  private getJson<T>(path: string): Promise<T> {
    return this.json<T>("GET", path);
  }

  private postJson<T>(path: string, body: unknown): Promise<T> {
    return this.json<T>("POST", path, body);
  }

  private putJson<T>(path: string, body: unknown): Promise<T> {
    return this.json<T>("PUT", path, body);
  }

  private async json<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await this.request(`${this.baseUrl}${path}`, {
      method,
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        Authorization: `Bearer ${this.options.accessToken}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) {
      throw new Error(`Gmail API request failed with HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  }
}

export function toGmailRawMessage(input: GmailMessageInput): string {
  const headers = [
    ["To", input.to.join(", ")],
    ...(input.cc?.length ? ([["Cc", input.cc.join(", ")]] as const) : []),
    ["Subject", input.subject],
    ["MIME-Version", "1.0"],
    ["Content-Type", 'text/plain; charset="UTF-8"'],
    ["Content-Transfer-Encoding", "8bit"]
  ];
  const mime = `${headers
    .map(([name, value]) => `${name}: ${sanitizeHeader(value)}`)
    .join("\r\n")}\r\n\r\n${input.body}`;
  return Buffer.from(mime, "utf8").toString("base64url");
}

function toDraftOutput(
  draft: GmailDraftResponse,
  fallbackDraftId?: string
): GmailDraftMutationOutput {
  const draftId = draft.id ?? fallbackDraftId;
  if (!draftId) {
    throw new Error("Gmail draft response did not include a draft id.");
  }
  return {
    draftId,
    messageId: draft.message?.id ?? null,
    threadId: draft.message?.threadId ?? null
  };
}

function toThreadMessage(message: GmailApiMessage): GmailThreadMessage {
  const headers = new Map(
    (message.payload?.headers ?? []).flatMap((header) =>
      header.name && header.value
        ? [[header.name.toLowerCase(), header.value] as const]
        : []
    )
  );
  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    internalDate: message.internalDate ?? null,
    from: headers.get("from") ?? "",
    to: headers.get("to") ?? "",
    subject: headers.get("subject") ?? "",
    snippet: (message.snippet ?? "").slice(0, 500),
    bodyText: extractBodyText(message.payload).slice(0, 20_000)
  };
}

function extractBodyText(payload: GmailApiMessage["payload"]): string {
  if (!payload) {
    return "";
  }
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  return (payload.parts ?? []).map(extractBodyText).join("\n").trim();
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sanitizeHeader(value: string): string {
  return value.replaceAll(/[\r\n]+/g, " ").trim();
}
