import type {
  AgentRunStatus,
  DocumentStatus,
  EvaluationStatus,
  RunStepStatus
} from "@devhub/contracts";

export class InvalidStatusTransitionError extends Error {
  public constructor(entity: string, from: string, to: string) {
    super(`${entity} cannot transition from ${from} to ${to}.`);
    this.name = "InvalidStatusTransitionError";
  }
}

type TransitionMap<T extends string> = Readonly<Record<T, readonly T[]>>;

const documentTransitions: TransitionMap<DocumentStatus> = {
  UPLOADED: ["PROCESSING", "DELETING"],
  PROCESSING: ["INDEXED", "FAILED", "DELETING"],
  INDEXED: ["PROCESSING", "DELETING"],
  FAILED: ["PROCESSING", "DELETING"],
  DELETING: []
};

const agentRunTransitions: TransitionMap<AgentRunStatus> = {
  QUEUED: ["RUNNING", "CANCEL_REQUESTED", "CANCELLED", "FAILED", "TIMED_OUT"],
  RUNNING: [
    "COMPLETED",
    "FAILED",
    "CANCEL_REQUESTED",
    "CANCELLED",
    "TIMED_OUT"
  ],
  CANCEL_REQUESTED: ["CANCELLED", "COMPLETED", "FAILED", "TIMED_OUT"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  TIMED_OUT: []
};

const runStepTransitions: TransitionMap<RunStepStatus> = {
  PENDING: ["RUNNING", "SKIPPED"],
  RUNNING: ["COMPLETED", "FAILED", "SKIPPED"],
  COMPLETED: [],
  FAILED: [],
  SKIPPED: []
};

const evaluationTransitions: TransitionMap<EvaluationStatus> = {
  QUEUED: ["RUNNING", "FAILED"],
  RUNNING: ["COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: []
};

function assertTransition<T extends string>(
  entity: string,
  transitions: TransitionMap<T>,
  from: T,
  to: T
): void {
  if (!transitions[from].includes(to)) {
    throw new InvalidStatusTransitionError(entity, from, to);
  }
}

export function assertDocumentTransition(
  from: DocumentStatus,
  to: DocumentStatus
): void {
  assertTransition("Document", documentTransitions, from, to);
}

export function assertAgentRunTransition(
  from: AgentRunStatus,
  to: AgentRunStatus
): void {
  assertTransition("AgentRun", agentRunTransitions, from, to);
}

export function assertRunStepTransition(
  from: RunStepStatus,
  to: RunStepStatus
): void {
  assertTransition("AgentRunStep", runStepTransitions, from, to);
}

export function assertEvaluationTransition(
  from: EvaluationStatus,
  to: EvaluationStatus
): void {
  assertTransition("EvaluationRun", evaluationTransitions, from, to);
}
