// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GithubOAuthCallbackPage from "../app/github/oauth/callback/page";
import { useAuth } from "../lib/auth";
import { completeGithubOAuth } from "../lib/github-api";

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams({ code: "oauth-code", state: "oauth-state" })
}));

vi.mock("../lib/auth", () => ({
  useAuth: vi.fn()
}));

vi.mock("../lib/github-api", () => ({
  completeGithubOAuth: vi.fn()
}));

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    status: "authenticated",
    accessToken: "access-token",
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn()
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("GitHub OAuth callback page", () => {
  it("completes OAuth and returns to integrations", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign }
    });
    vi.mocked(completeGithubOAuth).mockResolvedValue({
      provider: "GITHUB",
      status: "CONNECTED",
      accountLogin: "octo-user",
      scopes: [],
      missingConfigKeys: [],
      connectedAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T12:00:00.000Z",
      installationCount: 0,
      repositoryCount: 0
    });

    render(<GithubOAuthCallbackPage />);

    await waitFor(() => {
      expect(completeGithubOAuth).toHaveBeenCalledWith("access-token", {
        code: "oauth-code",
        state: "oauth-state"
      });
    });
    expect(await screen.findByText(/GitHub is connected/i)).toBeVisible();

    await waitFor(
      () => {
        expect(assign).toHaveBeenCalledWith("/?section=integrations");
      },
      { timeout: 1500 }
    );
  });

  it("shows callback errors", async () => {
    vi.mocked(completeGithubOAuth).mockRejectedValue(new Error("bad state"));

    render(<GithubOAuthCallbackPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("bad state");
  });
});
