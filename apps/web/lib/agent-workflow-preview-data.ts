import type {
  AgentDefinition,
  AgentTemplateKey,
  AgentWorkflowDefinition,
  AgentWorkflowEdge,
  AgentWorkflowNode
} from "@devhub/contracts";

export interface WorkflowPreviewNode {
  id: string;
  label: string;
  type: AgentWorkflowNode["type"];
  column: number;
  row: number;
}

export interface WorkflowPreviewEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface WorkflowPreviewGraph {
  title: string;
  description: string;
  nodes: readonly WorkflowPreviewNode[];
  edges: readonly WorkflowPreviewEdge[];
}

type WorkflowPreviewTemplate = AgentTemplateKey | "custom-knowledge";

const TEMPLATE_TITLES: Record<WorkflowPreviewTemplate, string> = {
  "knowledge-researcher": "Knowledge Researcher workflow",
  "daily-news-briefing": "Daily News Briefing workflow",
  "gmail-triage": "Gmail Triage workflow",
  "gmail-reply-assistant": "Gmail Reply Assistant workflow",
  "usage-analyst": "Usage Analyst workflow",
  "repository-researcher": "Repository Researcher workflow",
  "custom-knowledge": "Knowledge workflow"
};

const TEMPLATE_DESCRIPTIONS: Record<WorkflowPreviewTemplate, string> = {
  "knowledge-researcher":
    "Retrieves tenant knowledge, generates an answer, and completes the durable run.",
  "daily-news-briefing":
    "Uses request RSS input or enabled tenant feeds before generating the briefing.",
  "gmail-triage":
    "Checks Gmail readiness, reads bounded thread data, and summarizes priority mail.",
  "gmail-reply-assistant":
    "Reads an explicit Gmail thread, drafts a reply, creates a review item, and waits for user review.",
  "usage-analyst":
    "Reads persisted token usage and summarizes operational cost and latency.",
  "repository-researcher":
    "Lists tenant-authorized GitHub repositories and uses read-only repository context for the answer.",
  "custom-knowledge":
    "Falls back to the default knowledge path when a custom agent enables knowledge search."
};

export function workflowPreviewForAgent(
  agent: AgentDefinition
): WorkflowPreviewGraph | null {
  const template = previewTemplateForAgent(agent);
  if (!template) {
    return null;
  }
  return workflowPreviewForTemplate(template);
}

export function defaultWorkflowDefinitionForAgent(
  agent: AgentDefinition
): AgentWorkflowDefinition | null {
  const template = previewTemplateForAgent(agent);
  return template ? workflowDefinitionForTemplate(template) : null;
}

export function workflowPreviewForTemplate(
  template: WorkflowPreviewTemplate
): WorkflowPreviewGraph {
  const definition = workflowDefinitionForTemplate(template);
  return {
    title: TEMPLATE_TITLES[template],
    description: TEMPLATE_DESCRIPTIONS[template],
    nodes: definition.nodes.map((node, index) => ({
      id: node.id,
      label: node.label ?? node.type,
      type: node.type,
      column: index,
      row: 0
    })),
    edges: definition.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      label: workflowConditionLabel(edge)
    }))
  };
}

function previewTemplateForAgent(
  agent: AgentDefinition
): WorkflowPreviewTemplate | null {
  if (agent.templateKey) {
    return agent.templateKey;
  }
  if (agent.enabledToolIds.includes("knowledge.search")) {
    return "custom-knowledge";
  }
  return null;
}

function workflowDefinitionForTemplate(
  template: WorkflowPreviewTemplate
): AgentWorkflowDefinition {
  if (template === "daily-news-briefing") {
    return {
      version: 1,
      nodes: [
        startNode(),
        conditionNode("rss-input?", "RSS input?"),
        newsNode("fetch-request-feed", "Fetch request feed", "run.rssUrl"),
        conditionNode("enabled-feeds?", "Enabled feeds?"),
        newsNode(
          "fetch-enabled-feeds",
          "Fetch enabled feeds",
          "tenant.enabledFeeds"
        ),
        failNode("missing-feeds", "Needs RSS feed"),
        llmNode("generate-briefing", "Generate briefing"),
        completeNode()
      ],
      edges: [
        edge("start-to-rss-check", "start", "rss-input?"),
        edge("rss-check-to-request-feed", "rss-input?", "fetch-request-feed", {
          type: "field.exists",
          field: "run.rssUrl"
        }),
        edge("rss-check-to-feed-check", "rss-input?", "enabled-feeds?", {
          type: "previousStep.failed",
          nodeId: "rss-input?"
        }),
        edge(
          "feed-check-to-enabled-feeds",
          "enabled-feeds?",
          "fetch-enabled-feeds",
          {
            type: "field.exists",
            field: "tenant.enabledFeeds"
          }
        ),
        edge("feed-check-to-missing-feeds", "enabled-feeds?", "missing-feeds", {
          type: "previousStep.failed",
          nodeId: "enabled-feeds?"
        }),
        edge(
          "request-feed-to-generate",
          "fetch-request-feed",
          "generate-briefing"
        ),
        edge(
          "enabled-feeds-to-generate",
          "fetch-enabled-feeds",
          "generate-briefing"
        ),
        edge("generate-to-complete", "generate-briefing", "complete")
      ]
    };
  }
  if (template === "usage-analyst") {
    return {
      version: 1,
      nodes: [
        startNode(),
        usageNode("summarize-usage", "Summarize usage"),
        llmNode("generate-analysis", "Generate analysis"),
        completeNode()
      ],
      edges: [
        edge("start-to-usage", "start", "summarize-usage"),
        edge("usage-to-generate", "summarize-usage", "generate-analysis"),
        edge("generate-to-complete", "generate-analysis", "complete")
      ]
    };
  }
  if (template === "repository-researcher") {
    return {
      version: 1,
      nodes: [
        startNode(),
        githubListRepositoriesNode("list-repositories", "List repositories"),
        llmNode("generate-research", "Generate repository summary"),
        completeNode()
      ],
      edges: [
        edge("start-to-list-repositories", "start", "list-repositories", {
          type: "tool.enabled",
          toolId: "github.list_repositories"
        }),
        edge(
          "list-repositories-to-generate",
          "list-repositories",
          "generate-research"
        ),
        edge("generate-to-complete", "generate-research", "complete")
      ]
    };
  }
  if (template === "gmail-triage") {
    return {
      version: 1,
      nodes: [
        startNode(),
        conditionNode("gmail-connected?", "Gmail connected?"),
        gmailSearchNode("search-threads", "Search threads"),
        gmailGetThreadNode("read-thread", "Read thread"),
        llmNode("generate-summary", "Generate triage summary"),
        failNode("missing-gmail", "Needs Gmail"),
        completeNode()
      ],
      edges: [
        edge("start-to-gmail-check", "start", "gmail-connected?"),
        edge("gmail-check-to-search", "gmail-connected?", "search-threads", {
          type: "connection.exists",
          provider: "GMAIL"
        }),
        edge("gmail-check-to-fail", "gmail-connected?", "missing-gmail", {
          type: "previousStep.failed",
          nodeId: "gmail-connected?"
        }),
        edge("search-to-read", "search-threads", "read-thread"),
        edge("read-to-generate", "read-thread", "generate-summary"),
        edge("generate-to-complete", "generate-summary", "complete")
      ]
    };
  }
  if (template === "gmail-reply-assistant") {
    return {
      version: 1,
      nodes: [
        startNode(),
        conditionNode("gmail-connected?", "Gmail connected?"),
        gmailGetThreadNode("read-thread", "Read explicit thread"),
        llmNode("generate-draft", "Generate draft"),
        gmailCreateDraftNode("create-draft", "Create Gmail draft"),
        humanReviewNode("review-draft", "Review draft"),
        failNode("missing-gmail", "Needs Gmail"),
        completeNode()
      ],
      edges: [
        edge("start-to-gmail-check", "start", "gmail-connected?"),
        edge("gmail-check-to-read", "gmail-connected?", "read-thread", {
          type: "connection.exists",
          provider: "GMAIL"
        }),
        edge("gmail-check-to-fail", "gmail-connected?", "missing-gmail", {
          type: "previousStep.failed",
          nodeId: "gmail-connected?"
        }),
        edge("read-to-generate", "read-thread", "generate-draft"),
        edge("generate-to-draft", "generate-draft", "create-draft"),
        edge("draft-to-review", "create-draft", "review-draft"),
        edge("review-to-complete", "review-draft", "complete")
      ]
    };
  }
  return {
    version: 1,
    nodes: [
      startNode(),
      knowledgeNode("retrieve-knowledge", "Retrieve knowledge"),
      llmNode("generate-answer", "Generate answer"),
      completeNode()
    ],
    edges: [
      edge("start-to-retrieve", "start", "retrieve-knowledge", {
        type: "tool.enabled",
        toolId: "knowledge.search"
      }),
      edge("retrieve-to-generate", "retrieve-knowledge", "generate-answer"),
      edge("generate-to-complete", "generate-answer", "complete")
    ]
  };
}

export function workflowConditionLabel(edge: AgentWorkflowEdge): string {
  const condition = edge.condition ?? { type: "always" };
  if (condition.type === "always") {
    return "always";
  }
  if (condition.type === "tool.enabled") {
    return `if ${condition.toolId} enabled`;
  }
  if (condition.type === "field.exists") {
    if (condition.field === "run.rssUrl") {
      return "if rssUrl exists";
    }
    if (condition.field === "tenant.enabledFeeds") {
      return "if enabled feeds exist";
    }
    return `if ${condition.field} exists`;
  }
  if (condition.type === "connection.exists") {
    return "if Gmail connected";
  }
  if (condition.type === "previousStep.failed") {
    return "on failure";
  }
  if (condition.type === "previousStep.succeeded") {
    return "on success";
  }
  if (condition.type === "field.equals") {
    return `if ${condition.field} equals ${String(condition.value)}`;
  }
  return condition.type;
}

function startNode(): AgentWorkflowNode {
  return { id: "start", type: "start", label: "Start", config: {} };
}

function knowledgeNode(id: string, label: string): AgentWorkflowNode {
  return {
    id,
    type: "knowledge.search",
    label,
    config: { documentIds: [], limit: 5, query: "run.message" }
  };
}

function newsNode(
  id: string,
  label: string,
  source: "run.rssUrl" | "tenant.enabledFeeds"
): AgentWorkflowNode {
  return {
    id,
    type: "news.fetch_rss",
    label,
    config: { limit: 5, source }
  };
}

function usageNode(id: string, label: string): AgentWorkflowNode {
  return {
    id,
    type: "usage.summary",
    label,
    config: { period: "30d" }
  };
}

function gmailSearchNode(id: string, label: string): AgentWorkflowNode {
  return {
    id,
    type: "gmail.search_threads",
    label,
    config: { maxResults: 10, query: "run.gmailSearchQuery" }
  };
}

function gmailGetThreadNode(id: string, label: string): AgentWorkflowNode {
  return {
    id,
    type: "gmail.get_thread",
    label,
    config: { threadId: "run.gmailThreadId" }
  };
}

function gmailCreateDraftNode(id: string, label: string): AgentWorkflowNode {
  return {
    id,
    type: "gmail.create_draft",
    label,
    config: { draft: "llm.generatedDraft" }
  };
}

function githubListRepositoriesNode(
  id: string,
  label: string
): AgentWorkflowNode {
  return {
    id,
    type: "github.list_repositories",
    label,
    config: { limit: 100 }
  };
}

function llmNode(id: string, label: string): AgentWorkflowNode {
  return {
    id,
    type: "llm.generate",
    label,
    config: { includePreviousOutputs: true, prompt: "agent.systemPrompt" }
  };
}

function conditionNode(id: string, label: string): AgentWorkflowNode {
  return {
    id,
    type: "condition",
    label,
    config: { condition: { type: "always" } }
  };
}

function humanReviewNode(id: string, label: string): AgentWorkflowNode {
  return {
    id,
    type: "human.review",
    label,
    config: { reviewType: "gmail.draft" }
  };
}

function completeNode(): AgentWorkflowNode {
  return {
    id: "complete",
    type: "complete",
    label: "Complete",
    config: { output: "previous.output" }
  };
}

function failNode(id: string, label: string): AgentWorkflowNode {
  return {
    id,
    type: "fail",
    label,
    config: { errorCode: "WORKFLOW_FAILED", message: "Workflow failed." }
  };
}

function edge(
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  condition?: AgentWorkflowEdge["condition"]
): AgentWorkflowEdge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    ...(condition ? { condition } : {})
  };
}
