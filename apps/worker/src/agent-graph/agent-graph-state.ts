import type {
  AgentRunConfigSnapshot,
  CreateAgentRun,
  GmailGetThreadOutput
} from "@devhub/contracts";
import type { TenantContext } from "@devhub/domain";
import { Annotation } from "@langchain/langgraph";

export interface ExecutionState {
  tokens: number;
  toolCalls: number;
}

export const AgentRunGraphState = Annotation.Root({
  config: Annotation<AgentRunConfigSnapshot | undefined>(),
  context: Annotation<TenantContext>(),
  finalAnswer: Annotation<string | undefined>(),
  gmailThread: Annotation<GmailGetThreadOutput | undefined>(),
  input: Annotation<CreateAgentRun | undefined>(),
  outputs: Annotation<string[]>(),
  runId: Annotation<string>(),
  shouldStop: Annotation<boolean>(),
  signal: Annotation<AbortSignal | undefined>(),
  tokens: Annotation<number>(),
  toolCalls: Annotation<number>()
});

export type AgentRunGraphStateValue = typeof AgentRunGraphState.State;

export function initialGraphState(input: {
  context: TenantContext;
  runId: string;
}): AgentRunGraphStateValue {
  return {
    config: undefined,
    context: input.context,
    finalAnswer: undefined,
    gmailThread: undefined,
    input: undefined,
    outputs: [],
    runId: input.runId,
    shouldStop: false,
    signal: undefined,
    tokens: 0,
    toolCalls: 0
  };
}

export function loadedGraphState(state: AgentRunGraphStateValue): {
  config: AgentRunConfigSnapshot;
  context: TenantContext;
  input: CreateAgentRun;
  runId: string;
  signal: AbortSignal;
} {
  if (!state.input || !state.config || !state.signal) {
    throw new Error("Agent run graph continued before loadRun completed.");
  }
  return {
    config: state.config,
    context: state.context,
    input: state.input,
    runId: state.runId,
    signal: state.signal
  };
}

export function executionStateFromGraph(
  state: AgentRunGraphStateValue
): ExecutionState {
  return {
    tokens: state.tokens,
    toolCalls: state.toolCalls
  };
}

export function graphStepUpdate(
  state: AgentRunGraphStateValue,
  output: string,
  execution: ExecutionState
): Partial<AgentRunGraphStateValue> {
  return {
    outputs: [...state.outputs, output],
    tokens: execution.tokens,
    toolCalls: execution.toolCalls
  };
}
