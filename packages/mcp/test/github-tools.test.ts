import { describe, expect, it } from "vitest";

import { createGithubTools } from "../src";

const context = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  correlationId: "test-correlation"
};

describe("GitHub MCP tools", () => {
  it("lists tenant-authorized repositories without a GitHub token", async () => {
    let tokenCalls = 0;
    const [tool] = createGithubTools({
      assertRepositoryAccess: () => Promise.resolve({}),
      getAccessToken: () => {
        tokenCalls += 1;
        return Promise.resolve("token");
      },
      listRepositories: () =>
        Promise.resolve([
          {
            fullName: "octo-org/hello-world",
            owner: "octo-org",
            name: "hello-world",
            private: false,
            defaultBranch: "main",
            htmlUrl: "https://github.com/octo-org/hello-world"
          }
        ])
    });

    await expect(tool!.execute({}, context)).resolves.toEqual({
      repositories: [
        {
          fullName: "octo-org/hello-world",
          owner: "octo-org",
          name: "hello-world",
          private: false,
          defaultBranch: "main",
          htmlUrl: "https://github.com/octo-org/hello-world"
        }
      ]
    });
    expect(tokenCalls).toBe(0);
  });

  it("blocks file reads for repositories outside the tenant allowlist", async () => {
    const getFile = createGithubTools({
      assertRepositoryAccess: () =>
        Promise.reject(new Error("GitHub repository is not authorized.")),
      getAccessToken: () => Promise.resolve("token"),
      listRepositories: () => Promise.resolve([])
    }).find((tool) => tool.id === "github.get_file")!;

    await expect(
      getFile.execute(
        {
          repositoryFullName: "foreign/private",
          path: "README.md"
        },
        context
      )
    ).rejects.toThrow("GitHub repository is not authorized.");
  });

  it("fetches bounded file text from an authorized repository", async () => {
    const getFile = createGithubTools({
      assertRepositoryAccess: () =>
        Promise.resolve({ providerInstallationId: "123" }),
      getAccessToken: (_context, authorization) =>
        Promise.resolve(
          authorization?.providerInstallationId === "123"
            ? "token-secret"
            : "wrong-token"
        ),
      listRepositories: () => Promise.resolve([]),
      fetch: (async () =>
        new Response(
          JSON.stringify({
            path: "README.md",
            sha: "abc123",
            content: Buffer.from("hello".repeat(20_000), "utf8").toString(
              "base64"
            ),
            encoding: "base64",
            html_url:
              "https://github.com/octo-org/hello-world/blob/main/README.md"
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )) as typeof fetch
    }).find((tool) => tool.id === "github.get_file")!;

    const output = await getFile.execute(
      {
        repositoryFullName: "octo-org/hello-world",
        path: "README.md"
      },
      context
    );

    expect(JSON.stringify(output)).not.toContain("token-secret");
    expect((output as { text: string }).text).toHaveLength(50_000);
  });
});
