# ADR 0007: LangGraph for Worker Orchestration

Status: Accepted

Use `@langchain/langgraph` Graph API inside `apps/worker` to express agent
execution as explicit nodes and edges. Use `@langchain/core` only for shared
message and tool primitives where they fit existing ports. PostgreSQL
`AgentRun` and `AgentRunStep` rows remain the durable execution record; BullMQ
continues to schedule work; Socket.IO and REST snapshots remain the UI
observation path.

LangGraph does not replace tenant authorization, MCP allowlists, tool schemas,
budget checks, provider ports, audit logging, or realtime event contracts. The
first migration must preserve the current runtime behavior: tenant-filtered RAG,
optional RSS tool use, LLM generation, cancellation, timeouts, token usage, and
idempotent step persistence.

LangSmith, LangGraph Server, remote graph deployment, and LangGraph
checkpointers are deferred. They can be evaluated later, but local durability
stays in the repository schema until a separate ADR changes that boundary.
