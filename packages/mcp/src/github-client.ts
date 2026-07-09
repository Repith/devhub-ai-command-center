export interface GithubRestClientOptions {
  accessToken: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface GithubContentResponse {
  content?: string;
  encoding?: string;
  html_url?: string;
  path?: string;
  sha?: string;
}

interface GithubSearchCodeResponse {
  items?: GithubSearchCodeItem[];
}

interface GithubSearchCodeItem {
  name?: string;
  path?: string;
  html_url?: string;
  score?: number;
  repository?: { full_name?: string };
}

interface GithubIssueResponse {
  number: number;
  title?: string;
  state?: string;
  html_url?: string;
  user?: { login?: string };
  updated_at?: string;
  pull_request?: unknown;
}

interface GithubPullResponse extends GithubIssueResponse {
  body?: string | null;
  merged?: boolean;
  base?: { ref?: string };
  head?: { ref?: string };
  changed_files?: number;
  additions?: number;
  deletions?: number;
}

export class GithubRestClient {
  private readonly baseUrl: string;
  private readonly request: typeof fetch;

  public constructor(private readonly options: GithubRestClientOptions) {
    this.baseUrl = options.baseUrl ?? "https://api.github.com";
    this.request = options.fetch ?? fetch;
  }

  public async getFile(input: {
    repositoryFullName: string;
    path: string;
    ref?: string;
  }): Promise<{
    repositoryFullName: string;
    path: string;
    ref: string | null;
    text: string;
    htmlUrl: string | null;
  }> {
    const response = await this.get<GithubContentResponse>(
      `/repos/${input.repositoryFullName}/contents/${encodePath(input.path)}${
        input.ref ? `?ref=${encodeURIComponent(input.ref)}` : ""
      }`
    );
    return {
      repositoryFullName: input.repositoryFullName,
      path: response.path ?? input.path,
      ref: response.sha ?? input.ref ?? null,
      text: boundText(decodeContent(response), 50_000),
      htmlUrl: response.html_url ?? null
    };
  }

  public async searchCode(input: {
    repositoryFullName: string;
    query: string;
    limit: number;
  }): Promise<{
    results: {
      repositoryFullName: string;
      path: string;
      name: string;
      htmlUrl: string;
      score: number;
    }[];
  }> {
    const query = `${input.query} repo:${input.repositoryFullName}`;
    const response = await this.get<GithubSearchCodeResponse>(
      `/search/code?q=${encodeURIComponent(query)}&per_page=${input.limit}`
    );
    return {
      results: (response.items ?? []).slice(0, input.limit).map((item) => ({
        repositoryFullName:
          item.repository?.full_name ?? input.repositoryFullName,
        path: item.path ?? item.name ?? "unknown",
        name: item.name ?? item.path ?? "unknown",
        htmlUrl:
          item.html_url ?? `https://github.com/${input.repositoryFullName}`,
        score: item.score ?? 0
      }))
    };
  }

  public async listIssues(input: {
    repositoryFullName: string;
    state: "open" | "closed" | "all";
    limit: number;
  }): Promise<{
    issues: {
      number: number;
      title: string;
      state: string;
      htmlUrl: string;
      authorLogin: string | null;
      updatedAt: string | null;
    }[];
  }> {
    const response = await this.get<GithubIssueResponse[]>(
      `/repos/${input.repositoryFullName}/issues?state=${input.state}&per_page=${input.limit}`
    );
    return {
      issues: response
        .filter((issue) => !issue.pull_request)
        .slice(0, input.limit)
        .map(toIssueSummary)
    };
  }

  public async listPullRequests(input: {
    repositoryFullName: string;
    state: "open" | "closed" | "all";
    limit: number;
  }): Promise<{
    pullRequests: {
      number: number;
      title: string;
      state: string;
      htmlUrl: string;
      authorLogin: string | null;
      updatedAt: string | null;
      merged: boolean | null;
    }[];
  }> {
    const response = await this.get<GithubPullResponse[]>(
      `/repos/${input.repositoryFullName}/pulls?state=${input.state}&per_page=${input.limit}`
    );
    return {
      pullRequests: response.slice(0, input.limit).map(toPullSummary)
    };
  }

  public async getPullRequest(input: {
    repositoryFullName: string;
    number: number;
  }): Promise<{
    number: number;
    title: string;
    state: string;
    htmlUrl: string;
    authorLogin: string | null;
    updatedAt: string | null;
    merged: boolean | null;
    body: string | null;
    baseRef: string;
    headRef: string;
    changedFiles: number;
    additions: number;
    deletions: number;
  }> {
    const response = await this.get<GithubPullResponse>(
      `/repos/${input.repositoryFullName}/pulls/${input.number}`
    );
    return {
      ...toPullSummary(response),
      body: response.body ? boundText(response.body, 20_000) : null,
      baseRef: response.base?.ref ?? "unknown",
      headRef: response.head?.ref ?? "unknown",
      changedFiles: response.changed_files ?? 0,
      additions: response.additions ?? 0,
      deletions: response.deletions ?? 0
    };
  }

  private async get<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? 15_000
    );
    try {
      const response = await this.request(`${this.baseUrl}${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.options.accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28"
        },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`GitHub API request failed with ${response.status}.`);
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function decodeContent(response: GithubContentResponse): string {
  if (!response.content || response.encoding !== "base64") {
    return "";
  }
  return Buffer.from(response.content.replace(/\n/g, ""), "base64").toString(
    "utf8"
  );
}

function toIssueSummary(issue: GithubIssueResponse): {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  authorLogin: string | null;
  updatedAt: string | null;
} {
  return {
    number: issue.number,
    title: boundText(issue.title ?? "Untitled", 500),
    state: issue.state ?? "unknown",
    htmlUrl: issue.html_url ?? "https://github.com",
    authorLogin: issue.user?.login ?? null,
    updatedAt: issue.updated_at ?? null
  };
}

function toPullSummary(pull: GithubPullResponse): {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  authorLogin: string | null;
  updatedAt: string | null;
  merged: boolean | null;
} {
  return {
    ...toIssueSummary(pull),
    merged: pull.merged ?? null
  };
}

function boundText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
