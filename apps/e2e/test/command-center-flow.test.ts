import { describe, expect, it } from "vitest";

import {
  agentRunSnapshotSchema,
  authenticatedUserSchema,
  createAgentRunSchema,
  createGmailDraftReviewSchema,
  createGithubActionReviewSchema,
  createGoldenCaseSchema,
  createNewsFeedSchema,
  documentChunkListSchema,
  documentSchema,
  evaluationReportSchema,
  gmailConnectionStatusSchema,
  gmailDraftReviewListSchema,
  githubActionReviewListSchema,
  githubConnectionStatusSchema,
  githubRepositoryListSchema,
  integrationsStatusResponseSchema,
  registerSchema,
  startGoldenEvaluationSchema,
  usageSummarySchema,
  type AgentRunStatus
} from "@devhub/contracts";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const agentId = "00000000-0000-4000-8000-000000000003";
const runId = "00000000-0000-4000-8000-000000000004";
const conversationId = "00000000-0000-4000-8000-000000000005";
const documentId = "00000000-0000-4000-8000-000000000006";
const chunkId = "00000000-0000-4000-8000-000000000007";
const reviewId = "00000000-0000-4000-8000-000000000008";
const evaluationRunId = "00000000-0000-4000-8000-000000000009";
const goldenCaseId = "00000000-0000-4000-8000-000000000010";
const githubRepositoryId = "00000000-0000-4000-8000-000000000013";
const githubInstallationId = "00000000-0000-4000-8000-000000000014";
const githubReviewId = "00000000-0000-4000-8000-000000000015";
const now = "2026-06-15T08:00:00.000Z";

describe("release command center flow", () => {
  it("covers the documented happy path with shared contracts", () => {
    expect(
      registerSchema.parse({
        email: "owner@example.com",
        password: "correct horse battery staple",
        tenantName: "Release Workspace",
        tenantSlug: "release-workspace"
      })
    ).toMatchObject({ tenantSlug: "release-workspace" });
    expect(
      authenticatedUserSchema.parse({
        userId,
        email: "owner@example.com",
        displayName: null,
        tenantId,
        tenantName: "Release Workspace",
        tenantSlug: "release-workspace",
        role: "OWNER"
      })
    ).toMatchObject({ tenantId, role: "OWNER" });

    expect(documentSchema.parse(indexedDocument())).toMatchObject({
      id: documentId,
      status: "INDEXED",
      chunkCount: 1
    });
    expect(
      documentChunkListSchema.parse({
        data: [
          {
            id: chunkId,
            documentId,
            ordinal: 0,
            content: "Release notes for tenant-safe command center retrieval.",
            tokenCount: 9,
            pageNumber: null,
            createdAt: now
          }
        ],
        page: page(1000)
      })
    ).toMatchObject({ data: [{ documentId }] });

    expect(
      createAgentRunSchema.parse({
        message: "Summarize the uploaded release notes with citations.",
        documentIds: [documentId],
        retrievalLimit: 5
      })
    ).toMatchObject({ retrievalLimit: 5 });
    expect(
      agentRunSnapshotSchema.parse(runSnapshot("COMPLETED"))
    ).toMatchObject({
      run: { id: runId, status: "COMPLETED" },
      steps: [
        expect.objectContaining({ kind: "rag.retrieve" }),
        expect.objectContaining({ kind: "llm.generate" })
      ]
    });

    expect(
      createNewsFeedSchema.parse({
        name: "Local AI Feed",
        url: "https://example.com/feed.xml",
        topic: "AI",
        enabled: true
      })
    ).toMatchObject({ enabled: true });
    expect(
      createAgentRunSchema.parse({
        message: "Brief me on the configured feeds.",
        newsFeedIds: ["00000000-0000-4000-8000-000000000011"],
        retrievalLimit: 5
      })
    ).toMatchObject({ newsFeedIds: expect.any(Array) });

    expect(
      gmailConnectionStatusSchema.parse({
        status: "CONNECTED",
        accountEmail: "owner@example.com",
        scopes: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.compose"
        ],
        requiredScopes: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.compose"
        ],
        missingConfigKeys: [],
        connectedAt: now,
        updatedAt: now,
        autoSendAllowed: false
      })
    ).toMatchObject({ status: "CONNECTED", autoSendAllowed: false });
    expect(
      createGmailDraftReviewSchema.parse({
        threadId: "thread-1",
        gmailDraftId: "draft-1",
        to: ["client@example.com"],
        cc: [],
        subject: "Re: Release follow-up",
        body: "Thanks for the note. A human will review this draft."
      })
    ).not.toHaveProperty("agentRunId");
    expect(gmailDraftReviewListSchema.parse(gmailDraftReviews())).toMatchObject(
      {
        data: [{ id: reviewId, status: "NEEDS_REVIEW" }]
      }
    );
    expect(
      createAgentRunSchema.parse({
        message: "Triage recent Gmail from the last week.",
        gmailSearchQuery: "newer_than:7d",
        retrievalLimit: 5
      })
    ).toMatchObject({ gmailSearchQuery: "newer_than:7d" });
    expect(agentRunSnapshotSchema.parse(gmailRunSnapshot())).toMatchObject({
      run: { configSnapshot: { enabledToolIds: ["gmail.search_threads"] } },
      steps: [expect.objectContaining({ kind: "mcp.gmail" })]
    });

    expect(
      githubConnectionStatusSchema.parse({
        provider: "GITHUB",
        status: "CONNECTED",
        accountLogin: "octo-user",
        scopes: ["repo"],
        missingConfigKeys: [],
        connectedAt: now,
        updatedAt: now,
        installationCount: 1,
        repositoryCount: 1
      })
    ).toMatchObject({ repositoryCount: 1 });
    expect(
      githubRepositoryListSchema.parse(githubRepositories())
    ).toMatchObject({
      data: [{ fullName: "octo-org/hello-world" }]
    });
    expect(
      integrationsStatusResponseSchema
        .parse({
          data: [
            {
              provider: "GMAIL",
              status: "CONNECTED",
              accountLabel: "owner@example.com",
              scopes: [
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.compose"
              ],
              missingConfigKeys: [],
              connectedAt: now,
              updatedAt: now
            },
            {
              provider: "GITHUB",
              status: "CONNECTED",
              accountLabel: "octo-user",
              scopes: ["repo"],
              missingConfigKeys: [],
              connectedAt: now,
              updatedAt: now
            }
          ]
        })
        .data.map((item) => item.provider)
    ).toEqual(["GMAIL", "GITHUB"]);
    expect(
      createAgentRunSchema.parse({
        message: "Inspect authorized repositories for release blockers.",
        retrievalLimit: 5
      })
    ).toMatchObject({ message: expect.stringContaining("repositories") });
    expect(agentRunSnapshotSchema.parse(githubRunSnapshot())).toMatchObject({
      run: {
        configSnapshot: { enabledToolIds: ["github.list_repositories"] }
      },
      steps: [expect.objectContaining({ kind: "mcp.github" })]
    });
    expect(
      createGithubActionReviewSchema.parse({
        repositoryFullName: "octo-org/hello-world",
        kind: "ISSUE_COMMENT",
        issueNumber: 7,
        body: "Looks good after the release checks."
      })
    ).toMatchObject({ kind: "ISSUE_COMMENT" });
    expect(
      githubActionReviewListSchema.parse(githubActionReviews())
    ).toMatchObject({
      data: [{ id: githubReviewId, status: "NEEDS_REVIEW" }]
    });

    expect(
      usageSummarySchema.parse({
        period: "30d",
        generatedAt: now,
        tenant: usageTotals(),
        periods: [
          {
            periodStart: "2026-06-15T00:00:00.000Z",
            periodEnd: "2026-06-16T00:00:00.000Z",
            ...usageTotals()
          }
        ],
        agents: [{ agentId, ...usageTotals() }],
        runs: [
          {
            runId,
            agentId,
            templateKey: "knowledge-researcher",
            workflowVersion: 1,
            toolCallsUsed: 1,
            retrievalHit: true,
            retrievalHitCount: 1,
            finalAnswerTokens: 28,
            modelLatencyMs: 120,
            status: "COMPLETED",
            startedAt: now,
            completedAt: now,
            createdAt: now,
            ...usageTotals()
          }
        ],
        providerModels: [
          { provider: "ollama", model: "qwen3:8b", ...usageTotals() }
        ],
        recentExpensiveRuns: [],
        budgetWarnings: []
      })
    ).toMatchObject({ runs: [{ retrievalHitCount: 1 }] });

    expect(
      createGoldenCaseSchema.parse({
        agentId,
        name: "Release RAG case",
        input: "Summarize release notes.",
        expectedFacts: ["command center"],
        expectedSources: ["release-notes.md"],
        forbiddenClaims: ["cross tenant"]
      })
    ).toMatchObject({ agentId });
    expect(
      startGoldenEvaluationSchema.parse({ mode: "FULL_AGENT_RUNTIME" })
    ).toMatchObject({ mode: "FULL_AGENT_RUNTIME" });
    expect(evaluationReportSchema.parse(evaluationReport())).toMatchObject({
      run: { mode: "FULL_AGENT_RUNTIME", status: "COMPLETED" },
      results: [
        {
          agentRunId: runId,
          retrievalHit: true,
          toolCallsUsed: 1,
          terminalStatus: "COMPLETED"
        }
      ]
    });
  });

  it("keeps PR36 accessibility targets explicit", () => {
    expect(accessibilityTargets).toEqual([
      "home dashboard",
      "agent workspace",
      "run timeline",
      "Gmail review queue",
      "news workspace",
      "workflow visualizer/editor"
    ]);
  });
});

const accessibilityTargets = [
  "home dashboard",
  "agent workspace",
  "run timeline",
  "Gmail review queue",
  "news workspace",
  "workflow visualizer/editor"
] as const;

function indexedDocument() {
  return {
    id: documentId,
    fileName: "release-notes.md",
    mimeType: "text/markdown",
    sizeBytes: 128,
    checksum: "sha256-release",
    status: "INDEXED",
    failureCode: null,
    failureDetail: null,
    chunkCount: 1,
    createdAt: now,
    updatedAt: now
  };
}

function runSnapshot(status: AgentRunStatus) {
  return {
    run: {
      id: runId,
      agentId,
      conversationId,
      status,
      input: {
        message: "Summarize the uploaded release notes with citations.",
        documentIds: [documentId],
        retrievalLimit: 5
      },
      configSnapshot: {
        agentId,
        provider: "ollama",
        model: "qwen3:8b",
        systemPrompt: "Use tenant-owned knowledge only.",
        templateKey: "knowledge-researcher",
        maxSteps: 8,
        maxToolCalls: 4,
        maxTokens: null,
        timeoutMs: 120000,
        enabledToolIds: ["knowledge.search"],
        knowledgeBaseIds: [documentId],
        configVersion: "agent:release:workflow:1",
        workflowVersion: 1
      },
      correlationId: "release-e2e",
      startedAt: now,
      completedAt: now,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now
    },
    steps: [
      step(1, "rag.retrieve", '{"sources":[{"chunkId":"chunk-1"}]}'),
      step(2, "llm.generate", '{"content":"Answer with citation."}')
    ]
  };
}

function step(sequence: number, kind: string, outputPreview: string) {
  return {
    id: `00000000-0000-4000-8000-${(20 + sequence)
      .toString()
      .padStart(12, "0")}`,
    agentRunId: runId,
    sequence,
    kind,
    status: "COMPLETED",
    inputPreview: "{}",
    outputPreview,
    durationMs: 12,
    errorCode: null,
    errorMessage: null,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now
  };
}

function gmailDraftReviews() {
  return {
    data: [
      {
        id: reviewId,
        agentRunId: runId,
        threadId: "thread-1",
        gmailDraftId: "draft-1",
        to: ["client@example.com"],
        cc: [],
        subject: "Re: Release follow-up",
        body: "Thanks for the note. A human will review this draft.",
        status: "NEEDS_REVIEW",
        createdAt: now,
        updatedAt: now,
        sentAt: null
      }
    ],
    page: page(100)
  };
}

function githubRepositories() {
  return {
    data: [
      {
        id: githubRepositoryId,
        installationId: githubInstallationId,
        providerRepositoryId: "123",
        owner: "octo-org",
        name: "hello-world",
        fullName: "octo-org/hello-world",
        private: false,
        defaultBranch: "main",
        htmlUrl: "https://github.com/octo-org/hello-world",
        updatedAt: now
      }
    ]
  };
}

function githubActionReviews() {
  return {
    data: [
      {
        id: githubReviewId,
        repositoryId: githubRepositoryId,
        repositoryFullName: "octo-org/hello-world",
        kind: "ISSUE_COMMENT",
        issueNumber: 7,
        pullRequestNumber: null,
        title: null,
        body: "Looks good after the release checks.",
        status: "NEEDS_REVIEW",
        createdAt: now,
        updatedAt: now,
        sentAt: null,
        externalUrl: null
      }
    ],
    page: page(100)
  };
}

function gmailRunSnapshot() {
  return runSnapshotWithTools({
    message: "Triage recent Gmail from the last week.",
    templateKey: "gmail-triage",
    enabledToolIds: ["gmail.search_threads"],
    steps: [step(1, "mcp.gmail", '{"threads":[{"id":"thread-1"}]}')]
  });
}

function githubRunSnapshot() {
  return runSnapshotWithTools({
    message: "Inspect authorized repositories for release blockers.",
    templateKey: "repository-researcher",
    enabledToolIds: ["github.list_repositories"],
    steps: [step(1, "mcp.github", '{"repositories":["octo-org/hello-world"]}')]
  });
}

function runSnapshotWithTools(input: {
  enabledToolIds: string[];
  message: string;
  steps: ReturnType<typeof step>[];
  templateKey: string;
}) {
  return {
    run: {
      id: runId,
      agentId,
      conversationId,
      status: "COMPLETED",
      input: {
        message: input.message,
        retrievalLimit: 5
      },
      configSnapshot: {
        agentId,
        provider: "ollama",
        model: "qwen3:8b",
        systemPrompt: "Use enabled external tools only.",
        templateKey: input.templateKey,
        maxSteps: 8,
        maxToolCalls: 4,
        maxTokens: null,
        timeoutMs: 120000,
        enabledToolIds: input.enabledToolIds,
        knowledgeBaseIds: [],
        configVersion: `agent:release:${input.templateKey}`,
        workflowVersion: 1
      },
      correlationId: "release-e2e",
      startedAt: now,
      completedAt: now,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now
    },
    steps: input.steps
  };
}

function evaluationReport() {
  return {
    run: {
      id: evaluationRunId,
      status: "COMPLETED",
      mode: "FULL_AGENT_RUNTIME",
      configVersion: "release-e2e",
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now
    },
    results: [
      {
        id: "00000000-0000-4000-8000-000000000012",
        evaluationRunId,
        goldenCaseId,
        mode: "FULL_AGENT_RUNTIME",
        agentRunId: runId,
        passed: true,
        score: 1,
        details: {
          answerPreview: "The command center answer cites release-notes.md.",
          expectedFacts: [{ value: "command center", matched: true }],
          forbiddenClaims: [{ value: "cross tenant", matched: false }],
          expectedSources: [{ value: "release-notes.md", matched: true }]
        },
        latencyMs: 120,
        inputTokens: 42,
        outputTokens: 28,
        retrievalHit: true,
        toolCallsUsed: 1,
        terminalStatus: "COMPLETED",
        errorCode: null,
        errorMessagePreview: null,
        workflowVersion: "default-langgraph:v1:knowledge-researcher",
        createdAt: now
      }
    ]
  };
}

function usageTotals() {
  return {
    inputTokens: 42,
    outputTokens: 28,
    totalTokens: 70,
    costMicros: 0,
    latencyMs: 120,
    retryCount: 0
  };
}

function page(limit: number) {
  return {
    cursor: null,
    nextCursor: null,
    limit
  };
}
