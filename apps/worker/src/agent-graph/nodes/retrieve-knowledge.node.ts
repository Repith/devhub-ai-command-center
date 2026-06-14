import type { AgentStepRunner } from "../agent-step-runner.js";
import type { AgentRunGraphStateValue } from "../agent-graph-state.js";

export function retrieveKnowledgeNode(
  runner: AgentStepRunner,
  state: AgentRunGraphStateValue
): Promise<Partial<AgentRunGraphStateValue>> {
  return runner.retrieveKnowledgeNode(state);
}
