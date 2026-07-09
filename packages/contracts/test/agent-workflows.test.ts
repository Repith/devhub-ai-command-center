import { describe, expect, it } from "vitest";

import {
  agentWorkflowConditionSchema,
  agentWorkflowDefinitionSchema,
  validateAgentWorkflowDefinition,
  type AgentWorkflowDefinition
} from "../src";

describe("agent workflow contracts", () => {
  it("validates a safe knowledge workflow definition", () => {
    const result = agentWorkflowDefinitionSchema.safeParse(knowledgeWorkflow());

    expect(result.success).toBe(true);
    expect(
      result.success ? result.data.nodes.map((node) => node.type) : []
    ).toEqual(["start", "knowledge.search", "llm.generate", "complete"]);
  });

  it("preserves optional visual node positions", () => {
    const result = agentWorkflowDefinitionSchema.safeParse({
      ...knowledgeWorkflow(),
      nodes: knowledgeWorkflow().nodes.map((node, index) => ({
        ...node,
        position: { x: index * 220, y: index === 0 ? 0 : 120 }
      }))
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.nodes[1]?.position : null).toEqual({
      x: 220,
      y: 120
    });
  });

  it("rejects arbitrary JavaScript and expression-like conditions", () => {
    expect(
      agentWorkflowConditionSchema.safeParse({
        type: "javascript",
        code: "return process.env.SECRET"
      }).success
    ).toBe(false);
    expect(
      agentWorkflowConditionSchema.safeParse({
        type: "field.equals",
        field: "run.message",
        value: "${eval('danger')}"
      }).success
    ).toBe(false);
    expect(
      agentWorkflowDefinitionSchema.safeParse({
        ...knowledgeWorkflow(),
        nodes: [
          ...knowledgeWorkflow().nodes,
          {
            id: "evil",
            type: "llm.generate",
            config: {
              code: "eval('danger')",
              includePreviousOutputs: true,
              prompt: "agent.systemPrompt"
            }
          }
        ]
      }).success
    ).toBe(false);
  });

  it("rejects unsupported tool ids in safe conditions", () => {
    expect(
      agentWorkflowConditionSchema.safeParse({
        type: "tool.enabled",
        toolId: "shell.exec"
      }).success
    ).toBe(false);
  });

  it("reports duplicate node ids and dangling edges", () => {
    const definition = {
      ...knowledgeWorkflow(),
      nodes: [
        ...knowledgeWorkflow().nodes,
        { id: "answer", type: "llm.generate", config: llmConfig() }
      ],
      edges: [
        ...knowledgeWorkflow().edges,
        {
          id: "dangling",
          sourceNodeId: "answer",
          targetNodeId: "missing"
        }
      ]
    } satisfies AgentWorkflowDefinition;

    const result = agentWorkflowDefinitionSchema.safeParse(definition);
    expect(result.success).toBe(false);
    expect(
      validateAgentWorkflowDefinition(definition).map((error) => error.code)
    ).toEqual(expect.arrayContaining(["DUPLICATE_NODE_ID", "DANGLING_EDGE"]));
  });

  it("rejects workflows without exactly one start and at least one terminal", () => {
    const result = agentWorkflowDefinitionSchema.safeParse({
      version: 1,
      nodes: [{ id: "answer", type: "llm.generate", config: llmConfig() }],
      edges: []
    });

    expect(result.success).toBe(false);
  });

  it("rejects orphaned nodes, non-terminal paths, and terminal outgoing edges", () => {
    const definition = {
      version: 1,
      nodes: [
        { id: "start", type: "start", config: {} },
        { id: "complete", type: "complete", config: completeConfig() },
        { id: "orphan", type: "usage.summary", config: { period: "30d" } },
        { id: "dead", type: "llm.generate", config: llmConfig() }
      ],
      edges: [
        {
          id: "start-complete",
          sourceNodeId: "start",
          targetNodeId: "complete"
        },
        { id: "complete-dead", sourceNodeId: "complete", targetNodeId: "dead" }
      ]
    } satisfies AgentWorkflowDefinition;

    expect(
      validateAgentWorkflowDefinition(definition).map((error) => error.code)
    ).toEqual(
      expect.arrayContaining([
        "ORPHANED_NODE",
        "TERMINAL_HAS_OUTGOING_EDGE",
        "UNREACHABLE_TERMINAL"
      ])
    );
    expect(agentWorkflowDefinitionSchema.safeParse(definition).success).toBe(
      false
    );
  });

  it("rejects incoming edges to the start node", () => {
    const definition = {
      ...knowledgeWorkflow(),
      edges: [
        ...knowledgeWorkflow().edges,
        {
          id: "answer-start",
          sourceNodeId: "answer",
          targetNodeId: "start"
        }
      ]
    } satisfies AgentWorkflowDefinition;

    expect(
      validateAgentWorkflowDefinition(definition).map((error) => error.code)
    ).toContain("START_HAS_INCOMING_EDGE");
    expect(agentWorkflowDefinitionSchema.safeParse(definition).success).toBe(
      false
    );
  });

  it("rejects unsupported cycles in the MVP workflow graph", () => {
    const definition = {
      ...knowledgeWorkflow(),
      edges: [
        { id: "start-search", sourceNodeId: "start", targetNodeId: "search" },
        { id: "search-answer", sourceNodeId: "search", targetNodeId: "answer" },
        { id: "answer-search", sourceNodeId: "answer", targetNodeId: "search" },
        {
          id: "answer-complete",
          sourceNodeId: "answer",
          targetNodeId: "complete"
        }
      ]
    } satisfies AgentWorkflowDefinition;

    expect(
      validateAgentWorkflowDefinition(definition).map((error) => error.code)
    ).toContain("UNSUPPORTED_CYCLE");
    expect(agentWorkflowDefinitionSchema.safeParse(definition).success).toBe(
      false
    );
  });
});

function knowledgeWorkflow(): AgentWorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "start", config: {} },
      {
        id: "search",
        type: "knowledge.search",
        config: { query: "run.message", limit: 5, documentIds: [] }
      },
      { id: "answer", type: "llm.generate", config: llmConfig() },
      { id: "complete", type: "complete", config: completeConfig() }
    ],
    edges: [
      { id: "start-search", sourceNodeId: "start", targetNodeId: "search" },
      { id: "search-answer", sourceNodeId: "search", targetNodeId: "answer" },
      {
        id: "answer-complete",
        sourceNodeId: "answer",
        targetNodeId: "complete",
        condition: { type: "always" }
      }
    ]
  };
}

function llmConfig(): {
  includePreviousOutputs: boolean;
  prompt: "agent.systemPrompt";
} {
  return { includePreviousOutputs: true, prompt: "agent.systemPrompt" };
}

function completeConfig(): { output: "previous.output" } {
  return { output: "previous.output" };
}
