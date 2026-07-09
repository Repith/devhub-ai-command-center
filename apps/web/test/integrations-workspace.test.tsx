// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntegrationsWorkspace } from "../components/integrations-workspace";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IntegrationsWorkspace", () => {
  it("renders Gmail and GitHub card states", async () => {
    vi.stubGlobal("fetch", fetchForIntegrations());

    renderWorkspace();

    expect(await screen.findByRole("heading", { name: "Gmail" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "GitHub" })).toBeVisible();
    expect(await screen.findAllByText("owner@example.com")).toHaveLength(2);
    expect(await screen.findAllByText("octo-user")).toHaveLength(2);
    expect(screen.getByText("octo-org/hello-world")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Reconnect Gmail" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Reconnect GitHub" })
    ).toBeEnabled();
  });

  it("keeps member access read-only", async () => {
    vi.stubGlobal("fetch", fetchForIntegrations());

    renderWorkspace({ canManage: false });

    expect(
      await screen.findByText(/Member access is read-only/i)
    ).toBeVisible();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Reconnect Gmail" })
      ).toBeDisabled();
    });
    expect(
      screen.getByRole("button", { name: "Sync repositories" })
    ).toBeDisabled();
  });
});

function renderWorkspace({ canManage = true } = {}): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  render(
    <QueryClientProvider client={queryClient}>
      <IntegrationsWorkspace accessToken="access-token" canManage={canManage} />
    </QueryClientProvider>
  );
}

function fetchForIntegrations(): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = requestUrl(input);
    if (url.endsWith("/api/v1/gmail/status")) {
      return jsonResponse({
        status: "CONNECTED",
        accountEmail: "owner@example.com",
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        missingConfigKeys: [],
        connectedAt: "2026-07-09T12:00:00.000Z",
        updatedAt: "2026-07-09T12:00:00.000Z",
        requiredScopes: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.compose"
        ],
        autoSendAllowed: false
      });
    }
    if (url.endsWith("/api/v1/github/status")) {
      return jsonResponse({
        provider: "GITHUB",
        status: "CONNECTED",
        accountLogin: "octo-user",
        scopes: ["repo"],
        missingConfigKeys: [],
        connectedAt: "2026-07-09T12:00:00.000Z",
        updatedAt: "2026-07-09T12:00:00.000Z",
        installationCount: 1,
        repositoryCount: 1
      });
    }
    if (url.endsWith("/api/v1/github/repositories")) {
      return jsonResponse({
        data: [
          {
            id: "00000000-0000-4000-8000-000000000101",
            installationId: "00000000-0000-4000-8000-000000000102",
            providerRepositoryId: "123",
            owner: "octo-org",
            name: "hello-world",
            fullName: "octo-org/hello-world",
            private: false,
            defaultBranch: "main",
            htmlUrl: "https://github.com/octo-org/hello-world",
            updatedAt: "2026-07-09T12:00:00.000Z"
          }
        ]
      });
    }
    return jsonResponse({}, 404);
  }) as typeof fetch;
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
