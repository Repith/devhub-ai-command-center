import { END, START, StateGraph } from "@langchain/langgraph";
import type { AgentStepRunner } from "./agent-step-runner.js";
import {
  AgentRunGraphState,
  type AgentRunGraphStateValue
} from "./agent-graph-state.js";
import { completeRunNode } from "./nodes/complete-run.node.js";
import { createGmailDraftReviewNode } from "./nodes/create-gmail-draft-review.node.js";
import { fetchNewsNode } from "./nodes/fetch-news.node.js";
import { generateAnswerNode } from "./nodes/generate-answer.node.js";
import { loadRunNode } from "./nodes/load-run.node.js";
import { retrieveKnowledgeNode } from "./nodes/retrieve-knowledge.node.js";
import { runGmailNode } from "./nodes/run-gmail.node.js";
import { runGithubNode } from "./nodes/run-github.node.js";
import { summarizeUsageNode } from "./nodes/summarize-usage.node.js";

export function createAgentRunGraph(runner: AgentStepRunner) {
  return new StateGraph(AgentRunGraphState)
    .addNode("loadRun", (state) => loadRunNode(runner, state))
    .addNode("retrieveKnowledge", (state) =>
      retrieveKnowledgeNode(runner, state)
    )
    .addNode("fetchNews", (state) => fetchNewsNode(runner, state))
    .addNode("runGmail", (state) => runGmailNode(runner, state))
    .addNode("runGithub", (state) => runGithubNode(runner, state))
    .addNode("summarizeUsage", (state) => summarizeUsageNode(runner, state))
    .addNode("generateAnswer", (state) => generateAnswerNode(runner, state))
    .addNode("createGmailDraftReview", (state) =>
      createGmailDraftReviewNode(runner, state)
    )
    .addNode("completeRun", (state) => completeRunNode(runner, state))
    .addEdge(START, "loadRun")
    .addConditionalEdges("loadRun", shouldContinueAfterLoad, [
      "retrieveKnowledge",
      END
    ])
    .addEdge("retrieveKnowledge", "fetchNews")
    .addEdge("fetchNews", "runGmail")
    .addEdge("runGmail", "runGithub")
    .addConditionalEdges("runGithub", shouldSummarizeUsage, [
      "summarizeUsage",
      "generateAnswer"
    ])
    .addEdge("summarizeUsage", "generateAnswer")
    .addConditionalEdges("generateAnswer", shouldCreateGmailDraftReview, [
      "createGmailDraftReview",
      "completeRun"
    ])
    .addEdge("createGmailDraftReview", "completeRun")
    .addEdge("completeRun", END)
    .compile();
}

export function shouldContinueAfterLoad(
  state: AgentRunGraphStateValue
): "retrieveKnowledge" | typeof END {
  return state.shouldStop ? END : "retrieveKnowledge";
}

export function shouldSummarizeUsage(
  state: AgentRunGraphStateValue
): "summarizeUsage" | "generateAnswer" {
  return state.config?.enabledToolIds.includes("usage.summary")
    ? "summarizeUsage"
    : "generateAnswer";
}

export function shouldCreateGmailDraftReview(
  state: AgentRunGraphStateValue
): "createGmailDraftReview" | "completeRun" {
  return state.config?.templateKey === "gmail-reply-assistant"
    ? "createGmailDraftReview"
    : "completeRun";
}
