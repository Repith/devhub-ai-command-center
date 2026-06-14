import type { AgentStepRunner } from "../agent-step-runner.js";
import type { AgentRunGraphStateValue } from "../agent-graph-state.js";

export function runGmailNode(
  runner: AgentStepRunner,
  state: AgentRunGraphStateValue
): Promise<Partial<AgentRunGraphStateValue>> {
  return runner.runGmailNode(state);
}
