import { z } from "zod";

import { uuidSchema } from "./api.js";
import { mcpToolIdSchema } from "./mcp.js";
import { usagePeriodSchema } from "./usage.js";

const nodeIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const edgeIdSchema = nodeIdSchema;

const workflowNodePositionSchema = z
  .object({
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000)
  })
  .strict();

export const agentWorkflowNodeTypeSchema = z.enum([
  "start",
  "knowledge.search",
  "news.fetch_rss",
  "usage.summary",
  "gmail.search_threads",
  "gmail.get_thread",
  "gmail.create_draft",
  "gmail.update_draft",
  "llm.generate",
  "condition",
  "human.review",
  "complete",
  "fail"
]);
export type AgentWorkflowNodeType = z.infer<typeof agentWorkflowNodeTypeSchema>;

const workflowFieldPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/);

const workflowComparableStringSchema = z
  .string()
  .max(500)
  .refine((value) => !/[`$]?\{|\beval\s*\(|\bFunction\s*\(|=>/.test(value), {
    message:
      "Workflow condition values must not contain executable expressions."
  });

const workflowComparableValueSchema = z.union([
  workflowComparableStringSchema,
  z.number(),
  z.boolean(),
  z.null()
]);

const alwaysConditionSchema = z
  .object({
    type: z.literal("always")
  })
  .strict();

const fieldExistsConditionSchema = z
  .object({
    type: z.literal("field.exists"),
    field: workflowFieldPathSchema
  })
  .strict();

const fieldEqualsConditionSchema = z
  .object({
    type: z.literal("field.equals"),
    field: workflowFieldPathSchema,
    value: workflowComparableValueSchema
  })
  .strict();

const toolEnabledConditionSchema = z
  .object({
    type: z.literal("tool.enabled"),
    toolId: mcpToolIdSchema
  })
  .strict();

const connectionExistsConditionSchema = z
  .object({
    type: z.literal("connection.exists"),
    provider: z.enum(["GMAIL"])
  })
  .strict();

const previousStepConditionSchema = z
  .object({
    type: z.enum(["previousStep.succeeded", "previousStep.failed"]),
    nodeId: nodeIdSchema
  })
  .strict();

export const agentWorkflowConditionSchema = z.discriminatedUnion("type", [
  alwaysConditionSchema,
  fieldExistsConditionSchema,
  fieldEqualsConditionSchema,
  toolEnabledConditionSchema,
  connectionExistsConditionSchema,
  previousStepConditionSchema
]);
export type AgentWorkflowCondition = z.infer<
  typeof agentWorkflowConditionSchema
>;

const startConfigSchema = z.object({}).strict();

const knowledgeSearchConfigSchema = z
  .object({
    query: z.enum(["run.message"]).default("run.message"),
    limit: z.number().int().min(1).max(20).default(5),
    documentIds: z.array(uuidSchema).max(50).default([])
  })
  .strict();

const newsFetchRssConfigSchema = z
  .object({
    source: z.enum(["run.rssUrl", "tenant.enabledFeeds"]),
    limit: z.number().int().min(1).max(20).default(5)
  })
  .strict();

const usageSummaryConfigSchema = z
  .object({
    period: usagePeriodSchema.default("30d")
  })
  .strict();

const gmailSearchThreadsConfigSchema = z
  .object({
    query: z.enum(["run.gmailSearchQuery", "run.message"]),
    maxResults: z.number().int().min(1).max(20).default(10)
  })
  .strict();

const gmailGetThreadConfigSchema = z
  .object({
    threadId: z.enum(["run.gmailThreadId", "previous.threadId"])
  })
  .strict();

const gmailCreateDraftConfigSchema = z
  .object({
    draft: z.enum(["llm.generatedDraft"])
  })
  .strict();

const gmailUpdateDraftConfigSchema = z
  .object({
    draftId: z.enum(["run.gmailDraftReviewId", "previous.draftId"]),
    draft: z.enum(["llm.generatedDraft"])
  })
  .strict();

const llmGenerateConfigSchema = z
  .object({
    prompt: z.enum(["agent.systemPrompt"]).default("agent.systemPrompt"),
    includePreviousOutputs: z.boolean().default(true)
  })
  .strict();

const conditionConfigSchema = z
  .object({
    condition: agentWorkflowConditionSchema
  })
  .strict();

const humanReviewConfigSchema = z
  .object({
    reviewType: z.enum(["gmail.draft", "generic.approval"])
  })
  .strict();

const completeConfigSchema = z
  .object({
    output: z.enum(["previous.output", "llm.answer"]).default("previous.output")
  })
  .strict();

const failConfigSchema = z
  .object({
    errorCode: z.string().trim().min(1).max(120).default("WORKFLOW_FAILED"),
    message: z.string().trim().min(1).max(500).default("Workflow failed.")
  })
  .strict();

export const agentWorkflowNodeSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("start"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: startConfigSchema.default({})
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("knowledge.search"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: knowledgeSearchConfigSchema.default({
        documentIds: [],
        limit: 5,
        query: "run.message"
      })
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("news.fetch_rss"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: newsFetchRssConfigSchema
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("usage.summary"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: usageSummaryConfigSchema.default({ period: "30d" })
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("gmail.search_threads"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: gmailSearchThreadsConfigSchema
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("gmail.get_thread"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: gmailGetThreadConfigSchema
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("gmail.create_draft"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: gmailCreateDraftConfigSchema
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("gmail.update_draft"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: gmailUpdateDraftConfigSchema
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("llm.generate"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: llmGenerateConfigSchema.default({
        includePreviousOutputs: true,
        prompt: "agent.systemPrompt"
      })
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("condition"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: conditionConfigSchema
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("human.review"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: humanReviewConfigSchema
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("complete"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: completeConfigSchema.default({ output: "previous.output" })
    })
    .strict(),
  z
    .object({
      id: nodeIdSchema,
      type: z.literal("fail"),
      label: z.string().trim().min(1).max(160).optional(),
      position: workflowNodePositionSchema.optional(),
      config: failConfigSchema.default({
        errorCode: "WORKFLOW_FAILED",
        message: "Workflow failed."
      })
    })
    .strict()
]);
export type AgentWorkflowNode = z.infer<typeof agentWorkflowNodeSchema>;

export const agentWorkflowEdgeSchema = z
  .object({
    id: edgeIdSchema,
    sourceNodeId: nodeIdSchema,
    targetNodeId: nodeIdSchema,
    condition: agentWorkflowConditionSchema
      .default({ type: "always" })
      .optional()
  })
  .strict();
export type AgentWorkflowEdge = z.infer<typeof agentWorkflowEdgeSchema>;

const agentWorkflowDefinitionBaseSchema = z
  .object({
    version: z.literal(1),
    nodes: z.array(agentWorkflowNodeSchema).min(1).max(100),
    edges: z.array(agentWorkflowEdgeSchema).max(200)
  })
  .strict();

export const agentWorkflowDefinitionSchema =
  agentWorkflowDefinitionBaseSchema.superRefine((definition, context) => {
    const errors = validateAgentWorkflowDefinition(definition);
    for (const error of errors) {
      context.addIssue({
        code: "custom",
        message: error.message,
        path: error.path
      });
    }
  });
export type AgentWorkflowDefinition = z.infer<
  typeof agentWorkflowDefinitionSchema
>;

export const saveAgentWorkflowSchema = z
  .object({
    definition: agentWorkflowDefinitionSchema
  })
  .strict();
export type SaveAgentWorkflow = z.infer<typeof saveAgentWorkflowSchema>;

export const agentWorkflowResponseSchema = z
  .object({
    definition: agentWorkflowDefinitionSchema.nullable(),
    version: z.number().int().positive().nullable()
  })
  .strict();
export type AgentWorkflowResponse = z.infer<typeof agentWorkflowResponseSchema>;

export const agentWorkflowValidationIssueSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    path: z.array(z.union([z.string(), z.number()]))
  })
  .strict();
export type AgentWorkflowValidationIssue = z.infer<
  typeof agentWorkflowValidationIssueSchema
>;

export const agentWorkflowValidationResponseSchema = z
  .object({
    valid: z.boolean(),
    errors: z.array(agentWorkflowValidationIssueSchema)
  })
  .strict();
export type AgentWorkflowValidationResponse = z.infer<
  typeof agentWorkflowValidationResponseSchema
>;

export interface AgentWorkflowValidationError {
  code:
    | "DANGLING_EDGE"
    | "DUPLICATE_EDGE_ID"
    | "DUPLICATE_NODE_ID"
    | "MISSING_START"
    | "MISSING_TERMINAL"
    | "ORPHANED_NODE"
    | "START_HAS_INCOMING_EDGE"
    | "TERMINAL_HAS_OUTGOING_EDGE"
    | "UNREACHABLE_TERMINAL"
    | "UNSUPPORTED_CYCLE";
  message: string;
  path: (string | number)[];
}

export function validateAgentWorkflowDefinition(
  definition: z.infer<typeof agentWorkflowDefinitionBaseSchema>
): AgentWorkflowValidationError[] {
  const errors: AgentWorkflowValidationError[] = [];
  const nodeIds = new Map<string, number>();
  const edgeIds = new Map<string, number>();

  definition.nodes.forEach((node, index) => {
    const existingIndex = nodeIds.get(node.id);
    if (existingIndex !== undefined) {
      errors.push({
        code: "DUPLICATE_NODE_ID",
        message: `Workflow node id "${node.id}" is duplicated.`,
        path: ["nodes", index, "id"]
      });
    } else {
      nodeIds.set(node.id, index);
    }
  });

  definition.edges.forEach((edge, index) => {
    const existingIndex = edgeIds.get(edge.id);
    if (existingIndex !== undefined) {
      errors.push({
        code: "DUPLICATE_EDGE_ID",
        message: `Workflow edge id "${edge.id}" is duplicated.`,
        path: ["edges", index, "id"]
      });
    } else {
      edgeIds.set(edge.id, index);
    }
    if (!nodeIds.has(edge.sourceNodeId)) {
      errors.push({
        code: "DANGLING_EDGE",
        message: `Workflow edge "${edge.id}" references a missing source node.`,
        path: ["edges", index, "sourceNodeId"]
      });
    }
    if (!nodeIds.has(edge.targetNodeId)) {
      errors.push({
        code: "DANGLING_EDGE",
        message: `Workflow edge "${edge.id}" references a missing target node.`,
        path: ["edges", index, "targetNodeId"]
      });
    }
  });

  const startNodes = definition.nodes.filter((node) => node.type === "start");
  if (startNodes.length !== 1) {
    errors.push({
      code: "MISSING_START",
      message: "Workflow must contain exactly one start node.",
      path: ["nodes"]
    });
  }

  const startNodeIds = new Set(startNodes.map((node) => node.id));
  definition.edges.forEach((edge, index) => {
    if (startNodeIds.has(edge.targetNodeId)) {
      errors.push({
        code: "START_HAS_INCOMING_EDGE",
        message: `Start node "${edge.targetNodeId}" must not have incoming edges.`,
        path: ["edges", index, "targetNodeId"]
      });
    }
  });

  const terminalNodeIds = new Set(
    definition.nodes
      .filter((node) => node.type === "complete" || node.type === "fail")
      .map((node) => node.id)
  );
  if (terminalNodeIds.size === 0) {
    errors.push({
      code: "MISSING_TERMINAL",
      message: "Workflow must contain at least one complete or fail node.",
      path: ["nodes"]
    });
  }

  for (const [index, node] of definition.nodes.entries()) {
    if (
      terminalNodeIds.has(node.id) &&
      definition.edges.some((edge) => edge.sourceNodeId === node.id)
    ) {
      errors.push({
        code: "TERMINAL_HAS_OUTGOING_EDGE",
        message: `Terminal node "${node.id}" must not have outgoing edges.`,
        path: ["nodes", index]
      });
    }
  }

  if (errors.some((error) => error.code === "DANGLING_EDGE")) {
    return errors;
  }

  const adjacency = buildAdjacency(definition);
  const startNode = startNodes[0];
  if (startNode) {
    const reachable = reachableFrom(startNode.id, adjacency);
    for (const [index, node] of definition.nodes.entries()) {
      if (!reachable.has(node.id)) {
        errors.push({
          code: "ORPHANED_NODE",
          message: `Workflow node "${node.id}" is not reachable from start.`,
          path: ["nodes", index]
        });
      }
    }
  }

  for (const cycleNodeId of cyclicNodeIds(adjacency)) {
    errors.push({
      code: "UNSUPPORTED_CYCLE",
      message: `Workflow node "${cycleNodeId}" participates in a cycle.`,
      path: ["nodes", nodeIds.get(cycleNodeId) ?? 0]
    });
  }

  for (const [index, node] of definition.nodes.entries()) {
    if (!canReachTerminal(node.id, adjacency, terminalNodeIds)) {
      errors.push({
        code: "UNREACHABLE_TERMINAL",
        message: `Workflow node "${node.id}" cannot reach a terminal node.`,
        path: ["nodes", index]
      });
    }
  }

  return errors;
}

function buildAdjacency(
  definition: z.infer<typeof agentWorkflowDefinitionBaseSchema>
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>(
    definition.nodes.map((node) => [node.id, []])
  );
  for (const edge of definition.edges) {
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  }
  return adjacency;
}

function reachableFrom(
  startNodeId: string,
  adjacency: ReadonlyMap<string, readonly string[]>
): Set<string> {
  const reachable = new Set<string>();
  const stack = [startNodeId];
  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (reachable.has(nodeId)) {
      continue;
    }
    reachable.add(nodeId);
    stack.push(...(adjacency.get(nodeId) ?? []));
  }
  return reachable;
}

function cyclicNodeIds(
  adjacency: ReadonlyMap<string, readonly string[]>
): Set<string> {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = new Set<string>();

  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      cyclic.add(nodeId);
      return;
    }
    if (visited.has(nodeId)) {
      return;
    }
    visiting.add(nodeId);
    for (const targetId of adjacency.get(nodeId) ?? []) {
      visit(targetId);
      if (cyclic.has(targetId)) {
        cyclic.add(nodeId);
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };

  for (const nodeId of adjacency.keys()) {
    visit(nodeId);
  }
  return cyclic;
}

function canReachTerminal(
  nodeId: string,
  adjacency: ReadonlyMap<string, readonly string[]>,
  terminalNodeIds: ReadonlySet<string>
): boolean {
  return [...reachableFrom(nodeId, adjacency)].some((reachableNodeId) =>
    terminalNodeIds.has(reachableNodeId)
  );
}
