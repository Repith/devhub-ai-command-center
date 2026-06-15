"use client";

import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node
} from "@xyflow/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type {
  AgentDefinition,
  AgentWorkflowCondition,
  AgentWorkflowDefinition,
  AgentWorkflowEdge,
  AgentWorkflowNode,
  AgentWorkflowNodeType,
  AgentWorkflowValidationResponse
} from "@devhub/contracts";
import { agentWorkflowNodeSchema } from "@devhub/contracts";

import {
  getAgentWorkflow,
  saveAgentWorkflow,
  validateAgentWorkflow
} from "../lib/agents-api";
import {
  defaultWorkflowDefinitionForAgent,
  workflowConditionLabel
} from "../lib/agent-workflow-preview-data";

interface AgentWorkflowEditorProps {
  accessToken: string;
  agent: AgentDefinition;
  canManage: boolean;
}

const NODE_TYPES: AgentWorkflowNodeType[] = [
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
];

const COLUMN_GAP = 220;
const ROW_GAP = 116;

type FlowNode = Node<{ label: string }>;

export function AgentWorkflowEditor({
  accessToken,
  agent,
  canManage
}: AgentWorkflowEditorProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const workflowQuery = useQuery({
    queryKey: ["agent-workflow", agent.id],
    queryFn: () => getAgentWorkflow(accessToken, agent.id)
  });
  const templateDefinition = useMemo(
    () => defaultWorkflowDefinitionForAgent(agent) ?? minimalWorkflow(),
    [agent]
  );
  const [definition, setDefinition] =
    useState<AgentWorkflowDefinition>(templateDefinition);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [validation, setValidation] =
    useState<AgentWorkflowValidationResponse | null>(null);
  const [configText, setConfigText] = useState("{}");
  const readOnly = !canManage;

  useEffect(() => {
    if (!workflowQuery.data) {
      return;
    }
    const nextDefinition = workflowQuery.data.definition ?? templateDefinition;
    setDefinition(nextDefinition);
    setNodes(toFlowNodes(nextDefinition));
    setEdges(toFlowEdges(nextDefinition));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setValidation(null);
  }, [setEdges, setNodes, templateDefinition, workflowQuery.data]);

  const selectedNode = definition.nodes.find(
    (node) => node.id === selectedNodeId
  );
  const selectedEdge = definition.edges.find(
    (edge) => edge.id === selectedEdgeId
  );

  useEffect(() => {
    setConfigText(
      selectedNode ? JSON.stringify(selectedNode.config, null, 2) : "{}"
    );
  }, [selectedNode]);

  const validateMutation = useMutation({
    mutationFn: () => validateAgentWorkflow(accessToken, agent.id, definition),
    onSuccess: (result) => setValidation(result)
  });
  const saveMutation = useMutation({
    mutationFn: () => saveAgentWorkflow(accessToken, agent.id, definition),
    onSuccess: async (result) => {
      setValidation({ valid: true, errors: [] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agents"] }),
        queryClient.invalidateQueries({
          queryKey: ["agent-workflow", agent.id]
        })
      ]);
      setDefinition(result.definition ?? definition);
    }
  });

  const updateDefinition = (
    updater: (current: AgentWorkflowDefinition) => AgentWorkflowDefinition
  ): void => {
    setDefinition((current) => {
      const next = updater(current);
      setNodes(toFlowNodes(next));
      setEdges(toFlowEdges(next));
      return next;
    });
    setValidation(null);
  };

  const addWorkflowNode = (type: AgentWorkflowNodeType): void => {
    const node = defaultNode(type, uniqueNodeId(type, definition.nodes));
    updateDefinition((current) => ({
      ...current,
      nodes: [...current.nodes, node]
    }));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  };

  const connectNodes = (connection: Connection): void => {
    if (!connection.source || !connection.target) {
      return;
    }
    const edge: AgentWorkflowEdge = {
      id: uniqueEdgeId(connection.source, connection.target, definition.edges),
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
      condition: { type: "always" }
    };
    updateDefinition((current) => ({
      ...current,
      edges: [...current.edges, edge]
    }));
  };

  const removeSelectedNode = (): void => {
    if (!selectedNode || selectedNode.type === "start") {
      return;
    }
    updateDefinition((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== selectedNode.id),
      edges: current.edges.filter(
        (edge) =>
          edge.sourceNodeId !== selectedNode.id &&
          edge.targetNodeId !== selectedNode.id
      )
    }));
    setSelectedNodeId(null);
  };

  const updateSelectedNodeLabel = (label: string): void => {
    if (!selectedNode) {
      return;
    }
    updateDefinition((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === selectedNode.id ? { ...node, label } : node
      )
    }));
  };

  const updateSelectedNodeConfig = (value: string): void => {
    setConfigText(value);
    if (!selectedNode) {
      return;
    }
    try {
      const config = JSON.parse(value) as unknown;
      const parsedNode = agentWorkflowNodeSchema.safeParse({
        ...selectedNode,
        config
      });
      if (!parsedNode.success) {
        setValidation({
          valid: false,
          errors: parsedNode.error.issues.map((issue) => ({
            code: issue.code,
            message: issue.message,
            path: issue.path.filter(
              (part): part is string | number =>
                typeof part === "string" || typeof part === "number"
            )
          }))
        });
        return;
      }
      updateDefinition((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === selectedNode.id ? parsedNode.data : node
        )
      }));
    } catch {
      setValidation({
        valid: false,
        errors: [
          {
            code: "INVALID_JSON",
            message: "Selected node config must be valid JSON.",
            path: ["nodes", selectedNode.id, "config"]
          }
        ]
      });
    }
  };

  const updateSelectedEdgeCondition = (preset: string): void => {
    if (!selectedEdge) {
      return;
    }
    const condition = conditionPreset(preset, selectedEdge.sourceNodeId);
    updateDefinition((current) => ({
      ...current,
      edges: current.edges.map((edge) =>
        edge.id === selectedEdge.id ? { ...edge, condition } : edge
      )
    }));
  };

  const resetToTemplate = (): void => {
    setDefinition(templateDefinition);
    setNodes(toFlowNodes(templateDefinition));
    setEdges(toFlowEdges(templateDefinition));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setValidation(null);
  };

  return (
    <section
      className="workflow-editor"
      aria-labelledby="workflow-editor-title"
    >
      <div className="workflow-editor-heading">
        <div>
          <p className="section-kicker">Workflow editor</p>
          <h3 id="workflow-editor-title">Safe block graph</h3>
        </div>
        <span>
          {workflowQuery.data?.version
            ? `v${workflowQuery.data.version}`
            : "template"}
        </span>
      </div>

      <div className="workflow-editor-layout">
        <aside className="workflow-palette" aria-label="Node palette">
          {NODE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              disabled={readOnly}
              onClick={() => addWorkflowNode(type)}
            >
              {type}
            </button>
          ))}
        </aside>

        <div className="workflow-editor-canvas" aria-label="Editable workflow">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={connectNodes}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            fitView
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesFocusable
            elementsSelectable
            minZoom={0.45}
            maxZoom={1.35}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={18} color="#303543" />
            <Controls showInteractive={!readOnly} />
          </ReactFlow>
        </div>

        <aside className="workflow-config-panel" aria-label="Selection config">
          {selectedNode ? (
            <div className="workflow-config-stack">
              <strong>{selectedNode.type}</strong>
              <label className="field">
                <span>Label</span>
                <input
                  value={selectedNode.label ?? ""}
                  disabled={readOnly}
                  onChange={(event) =>
                    updateSelectedNodeLabel(event.target.value)
                  }
                />
              </label>
              <label className="field">
                <span>Config JSON</span>
                <textarea
                  rows={8}
                  value={configText}
                  disabled={readOnly}
                  spellCheck={false}
                  onChange={(event) =>
                    updateSelectedNodeConfig(event.target.value)
                  }
                />
              </label>
              <button
                className="danger-button"
                type="button"
                disabled={readOnly || selectedNode.type === "start"}
                onClick={removeSelectedNode}
              >
                Delete node
              </button>
            </div>
          ) : selectedEdge ? (
            <div className="workflow-config-stack">
              <strong>{selectedEdge.id}</strong>
              <label className="field">
                <span>Condition</span>
                <select
                  disabled={readOnly}
                  value={conditionPresetValue(selectedEdge.condition)}
                  onChange={(event) =>
                    updateSelectedEdgeCondition(event.target.value)
                  }
                >
                  <option value="always">Always</option>
                  <option value="knowledge">Knowledge tool enabled</option>
                  <option value="rss">RSS input exists</option>
                  <option value="feeds">Enabled feeds exist</option>
                  <option value="gmail">Gmail connected</option>
                  <option value="failure">On source failure</option>
                </select>
              </label>
            </div>
          ) : (
            <p>Select a node or edge to edit its safe definition.</p>
          )}
        </aside>
      </div>

      <div className="workflow-validation-panel" aria-live="polite">
        {validation ? (
          validation.valid ? (
            <p className="success-text">Server validation passed.</p>
          ) : (
            <ul>
              {validation.errors.map((error, index) => (
                <li key={`${error.code}-${index}`}>
                  <strong>{error.code}</strong>: {error.message}
                </li>
              ))}
            </ul>
          )
        ) : (
          <p>Validate the workflow before saving changes.</p>
        )}
        <div className="form-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={workflowQuery.isPending}
            onClick={resetToTemplate}
          >
            Reset to template graph
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={readOnly || validateMutation.isPending}
            onClick={() => void validateMutation.mutateAsync()}
          >
            {validateMutation.isPending ? "Validating..." : "Validate"}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={readOnly || !validation?.valid || saveMutation.isPending}
            onClick={() => void saveMutation.mutateAsync()}
          >
            {saveMutation.isPending ? "Saving..." : "Save workflow"}
          </button>
        </div>
        {workflowQuery.error || validateMutation.error || saveMutation.error ? (
          <p role="alert">
            {errorMessage(
              workflowQuery.error ??
                validateMutation.error ??
                saveMutation.error
            )}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function toFlowNodes(definition: AgentWorkflowDefinition): FlowNode[] {
  return definition.nodes.map((node, index) => ({
    id: node.id,
    data: { label: node.label ?? node.type },
    position: {
      x: (index % 4) * COLUMN_GAP,
      y: Math.floor(index / 4) * ROW_GAP
    },
    type: "default",
    deletable: node.type !== "start",
    className: `workflow-node workflow-node-${node.type.replace(".", "-")}`
  }));
}

function toFlowEdges(definition: AgentWorkflowDefinition): Edge[] {
  return definition.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: workflowConditionLabel(edge),
    animated: (edge.condition?.type ?? "always") !== "always",
    markerEnd: { type: MarkerType.ArrowClosed },
    className:
      edge.condition?.type === "previousStep.failed"
        ? "workflow-edge-failure"
        : ""
  }));
}

function minimalWorkflow(): AgentWorkflowDefinition {
  return {
    version: 1,
    nodes: [
      { id: "start", type: "start", label: "Start", config: {} },
      {
        id: "generate-answer",
        type: "llm.generate",
        label: "Generate answer",
        config: { includePreviousOutputs: true, prompt: "agent.systemPrompt" }
      },
      {
        id: "complete",
        type: "complete",
        label: "Complete",
        config: { output: "previous.output" }
      }
    ],
    edges: [
      {
        id: "start-to-generate",
        sourceNodeId: "start",
        targetNodeId: "generate-answer"
      },
      {
        id: "generate-to-complete",
        sourceNodeId: "generate-answer",
        targetNodeId: "complete"
      }
    ]
  };
}

function defaultNode(
  type: AgentWorkflowNodeType,
  id: string
): AgentWorkflowNode {
  const label = type
    .split(".")
    .map((part) => part.replace("_", " "))
    .join(" ");
  if (type === "knowledge.search") {
    return {
      id,
      type,
      label,
      config: { documentIds: [], limit: 5, query: "run.message" }
    };
  }
  if (type === "news.fetch_rss") {
    return {
      id,
      type,
      label,
      config: { limit: 5, source: "tenant.enabledFeeds" }
    };
  }
  if (type === "usage.summary") {
    return { id, type, label, config: { period: "30d" } };
  }
  if (type === "gmail.search_threads") {
    return {
      id,
      type,
      label,
      config: { maxResults: 10, query: "run.gmailSearchQuery" }
    };
  }
  if (type === "gmail.get_thread") {
    return { id, type, label, config: { threadId: "run.gmailThreadId" } };
  }
  if (type === "gmail.create_draft") {
    return { id, type, label, config: { draft: "llm.generatedDraft" } };
  }
  if (type === "gmail.update_draft") {
    return {
      id,
      type,
      label,
      config: { draft: "llm.generatedDraft", draftId: "previous.draftId" }
    };
  }
  if (type === "llm.generate") {
    return {
      id,
      type,
      label,
      config: { includePreviousOutputs: true, prompt: "agent.systemPrompt" }
    };
  }
  if (type === "condition") {
    return { id, type, label, config: { condition: { type: "always" } } };
  }
  if (type === "human.review") {
    return { id, type, label, config: { reviewType: "generic.approval" } };
  }
  if (type === "complete") {
    return { id, type, label, config: { output: "previous.output" } };
  }
  if (type === "fail") {
    return {
      id,
      type,
      label,
      config: { errorCode: "WORKFLOW_FAILED", message: "Workflow failed." }
    };
  }
  return { id: "start", type: "start", label: "Start", config: {} };
}

function conditionPreset(
  preset: string,
  sourceNodeId: string
): AgentWorkflowCondition {
  if (preset === "knowledge") {
    return { type: "tool.enabled", toolId: "knowledge.search" };
  }
  if (preset === "rss") {
    return { type: "field.exists", field: "run.rssUrl" };
  }
  if (preset === "feeds") {
    return { type: "field.exists", field: "tenant.enabledFeeds" };
  }
  if (preset === "gmail") {
    return { type: "connection.exists", provider: "GMAIL" };
  }
  if (preset === "failure") {
    return { type: "previousStep.failed", nodeId: sourceNodeId };
  }
  return { type: "always" };
}

function conditionPresetValue(
  condition: AgentWorkflowCondition | undefined
): string {
  if (!condition || condition.type === "always") {
    return "always";
  }
  if (condition.type === "tool.enabled") {
    return "knowledge";
  }
  if (condition.type === "field.exists" && condition.field === "run.rssUrl") {
    return "rss";
  }
  if (
    condition.type === "field.exists" &&
    condition.field === "tenant.enabledFeeds"
  ) {
    return "feeds";
  }
  if (condition.type === "connection.exists") {
    return "gmail";
  }
  if (condition.type === "previousStep.failed") {
    return "failure";
  }
  return "always";
}

function uniqueNodeId(
  type: AgentWorkflowNodeType,
  nodes: readonly AgentWorkflowNode[]
): string {
  const base = type.replace(".", "-").replace("_", "-");
  const ids = new Set(nodes.map((node) => node.id));
  let index = 1;
  while (ids.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

function uniqueEdgeId(
  sourceNodeId: string,
  targetNodeId: string,
  edges: readonly AgentWorkflowEdge[]
): string {
  const base = `${sourceNodeId}-to-${targetNodeId}`;
  const ids = new Set(edges.map((edge) => edge.id));
  let candidate = base;
  let index = 1;
  while (ids.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Workflow action failed.";
}
