import { END, START, StateGraph } from "@langchain/langgraph";

import type {
  AgentWorkflowCondition,
  AgentWorkflowDefinition,
  AgentWorkflowNode,
  McpToolId
} from "@devhub/contracts";
import { agentWorkflowDefinitionSchema } from "@devhub/contracts";

import {
  AgentRunGraphState,
  type AgentRunGraphStateValue
} from "./agent-graph-state.js";
import type { AgentStepRunner } from "./agent-step-runner.js";
import { completeRunNode } from "./nodes/complete-run.node.js";
import { createGmailDraftReviewNode } from "./nodes/create-gmail-draft-review.node.js";
import { fetchNewsNode } from "./nodes/fetch-news.node.js";
import { generateAnswerNode } from "./nodes/generate-answer.node.js";
import { loadRunNode } from "./nodes/load-run.node.js";
import { retrieveKnowledgeNode } from "./nodes/retrieve-knowledge.node.js";
import { runGmailNode } from "./nodes/run-gmail.node.js";
import { summarizeUsageNode } from "./nodes/summarize-usage.node.js";

type WorkflowNodeHandler = (
  state: AgentRunGraphStateValue
) => Promise<Partial<AgentRunGraphStateValue>>;

type WorkflowRoute = string | typeof END;

interface CompiledWorkflowGraph {
  invoke(state: AgentRunGraphStateValue): Promise<AgentRunGraphStateValue>;
}

interface WorkflowGraphBuilder {
  addConditionalEdges(
    source: string,
    path: (state: AgentRunGraphStateValue) => WorkflowRoute,
    pathMap: readonly WorkflowRoute[]
  ): WorkflowGraphBuilder;
  addEdge(source: string, target: WorkflowRoute): WorkflowGraphBuilder;
  addNode(name: string, handler: WorkflowNodeHandler): WorkflowGraphBuilder;
  compile(): CompiledWorkflowGraph;
}

export class WorkflowCompilerError extends Error {
  public constructor(
    public readonly code:
      | "DISABLED_TOOL"
      | "INVALID_WORKFLOW"
      | "UNSUPPORTED_NODE"
      | "UNROUTABLE_WORKFLOW",
    message: string
  ) {
    super(message);
    this.name = "WorkflowCompilerError";
  }
}

export function compileAgentWorkflowDefinition(
  definition: AgentWorkflowDefinition,
  runner: AgentStepRunner
): CompiledWorkflowGraph {
  const parsed = agentWorkflowDefinitionSchema.safeParse(definition);
  if (!parsed.success) {
    throw new WorkflowCompilerError(
      "INVALID_WORKFLOW",
      parsed.error.issues.map((issue) => issue.message).join("; ")
    );
  }

  const workflow = parsed.data;
  const nodeNames = new Map(
    workflow.nodes.map((node) => [node.id, workflowNodeName(node.id)])
  );
  const startNode = workflow.nodes.find((node) => node.type === "start");
  if (!startNode) {
    throw new WorkflowCompilerError(
      "INVALID_WORKFLOW",
      "Workflow must contain a start node."
    );
  }

  const graph = new StateGraph(
    AgentRunGraphState
  ) as unknown as WorkflowGraphBuilder;
  graph.addNode("loadRun", (state) => loadRunNode(runner, state));

  for (const node of workflow.nodes) {
    graph.addNode(
      nodeNames.get(node.id)!,
      workflowHandlerForNode(node, runner)
    );
  }

  graph.addEdge(START, "loadRun");
  graph.addConditionalEdges(
    "loadRun",
    (state): WorkflowRoute =>
      state.shouldStop ? END : nodeNames.get(startNode.id)!,
    [nodeNames.get(startNode.id)!, END]
  );

  for (const node of workflow.nodes) {
    const sourceName = nodeNames.get(node.id)!;
    if (node.type === "complete" || node.type === "fail") {
      graph.addEdge(sourceName, END);
      continue;
    }

    const outgoing = workflow.edges.filter(
      (edge) => edge.sourceNodeId === node.id
    );
    const targets = outgoing.map((edge) => nodeNames.get(edge.targetNodeId)!);
    graph.addConditionalEdges(
      sourceName,
      (state): WorkflowRoute =>
        selectWorkflowRoute(state, node.id, outgoing, nodeNames),
      targets
    );
  }

  return graph.compile();
}

function workflowHandlerForNode(
  node: AgentWorkflowNode,
  runner: AgentStepRunner
): WorkflowNodeHandler {
  if (
    node.type === "start" ||
    node.type === "condition" ||
    node.type === "human.review"
  ) {
    return () => Promise.resolve({});
  }
  if (node.type === "knowledge.search") {
    return guardedToolHandler("knowledge.search", (state) =>
      retrieveKnowledgeNode(runner, state)
    );
  }
  if (node.type === "news.fetch_rss") {
    return guardedToolHandler("news.fetch_rss", (state) =>
      fetchNewsNode(runner, state)
    );
  }
  if (node.type === "usage.summary") {
    return guardedToolHandler("usage.summary", (state) =>
      summarizeUsageNode(runner, state)
    );
  }
  if (
    node.type === "gmail.create_draft" ||
    node.type === "gmail.update_draft"
  ) {
    return guardedToolHandler(node.type, (state) =>
      createGmailDraftReviewNode(runner, state)
    );
  }
  if (
    node.type === "gmail.search_threads" ||
    node.type === "gmail.get_thread"
  ) {
    return guardedToolHandler(node.type, (state) =>
      runGmailNode(runner, state)
    );
  }
  if (node.type === "llm.generate") {
    return (state) => generateAnswerNode(runner, state);
  }
  if (node.type === "complete") {
    return (state) => completeRunNode(runner, state);
  }
  if (node.type === "fail") {
    return () =>
      Promise.reject(
        new WorkflowCompilerError("UNROUTABLE_WORKFLOW", node.config.message)
      );
  }
  return unsupportedNodeHandler();
}

function guardedToolHandler(
  toolId: McpToolId,
  handler: WorkflowNodeHandler
): WorkflowNodeHandler {
  return async (state) => {
    if (!state.config?.enabledToolIds.includes(toolId)) {
      throw new WorkflowCompilerError(
        "DISABLED_TOOL",
        `Workflow tool "${toolId}" is not enabled for this agent.`
      );
    }
    return handler(state);
  };
}

function selectWorkflowRoute(
  state: AgentRunGraphStateValue,
  sourceNodeId: string,
  outgoing: readonly AgentWorkflowDefinition["edges"][number][],
  nodeNames: ReadonlyMap<string, string>
): WorkflowRoute {
  for (const edge of outgoing) {
    if (evaluateCondition(edge.condition ?? { type: "always" }, state)) {
      return nodeNames.get(edge.targetNodeId)!;
    }
  }
  throw new WorkflowCompilerError(
    "UNROUTABLE_WORKFLOW",
    `Workflow node "${sourceNodeId}" has no matching outgoing condition.`
  );
}

function evaluateCondition(
  condition: AgentWorkflowCondition,
  state: AgentRunGraphStateValue
): boolean {
  if (condition.type === "always") {
    return true;
  }
  if (condition.type === "tool.enabled") {
    return Boolean(state.config?.enabledToolIds.includes(condition.toolId));
  }
  if (condition.type === "connection.exists") {
    return (
      condition.provider === "GMAIL" &&
      gmailToolIds.some((toolId) =>
        state.config?.enabledToolIds.includes(toolId)
      )
    );
  }
  if (condition.type === "field.exists") {
    const value = workflowFieldValue(condition.field, state);
    return Array.isArray(value)
      ? value.length > 0
      : value !== undefined && value !== null && value !== "";
  }
  if (condition.type === "field.equals") {
    return workflowFieldValue(condition.field, state) === condition.value;
  }
  if (condition.type === "previousStep.succeeded") {
    return state.outputs.length > 0;
  }
  if (condition.type === "previousStep.failed") {
    return state.outputs.length === 0;
  }
  return false;
}

function workflowFieldValue(
  field: string,
  state: AgentRunGraphStateValue
): unknown {
  if (field === "run.message") {
    return state.input?.message;
  }
  if (field === "run.rssUrl") {
    return state.input?.rssUrl;
  }
  if (field === "run.gmailSearchQuery") {
    return state.input?.gmailSearchQuery;
  }
  if (field === "run.gmailThreadId") {
    return state.input?.gmailThreadId;
  }
  if (field === "run.gmailDraftReviewId") {
    return state.input?.gmailDraftReviewId;
  }
  if (field === "tenant.enabledFeeds") {
    return state.input?.newsFeedIds;
  }
  if (field === "previous.output") {
    return state.outputs.at(-1);
  }
  if (field === "previous.threadId") {
    return state.gmailThread?.id;
  }
  return undefined;
}

function workflowNodeName(nodeId: string): string {
  return `workflow__${nodeId.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function unsupportedNodeHandler(): WorkflowNodeHandler {
  return () =>
    Promise.reject(
      new WorkflowCompilerError(
        "UNSUPPORTED_NODE",
        "Workflow node type is not supported."
      )
    );
}

const gmailToolIds = [
  "gmail.search_threads",
  "gmail.get_thread",
  "gmail.create_draft",
  "gmail.update_draft"
] as const satisfies readonly McpToolId[];
