"use client";

import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  Position,
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
type LayoutPoint = { x: number; y: number };

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

  const setLocalValidationError = (
    code: string,
    message: string,
    path: (string | number)[] = ["edges"]
  ): void => {
    setValidation({
      valid: false,
      errors: [{ code, message, path }]
    });
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
    const error = invalidConnectionMessage(definition, connection, agent);
    if (error) {
      setLocalValidationError("INVALID_CONNECTION", error);
      return;
    }
    const source = connection.source!;
    const target = connection.target!;
    if (
      definition.edges.some(
        (edge) => edge.sourceNodeId === source && edge.targetNodeId === target
      )
    ) {
      return;
    }
    const edge: AgentWorkflowEdge = {
      id: uniqueEdgeId(source, target, definition.edges),
      sourceNodeId: source,
      targetNodeId: target,
      condition: { type: "always" }
    };
    updateDefinition((current) => ({
      ...current,
      edges: [
        ...(connection.source === "start"
          ? current.edges.filter((item) => item.sourceNodeId !== "start")
          : current.edges),
        edge
      ]
    }));
    setSelectedNodeId(null);
    setSelectedEdgeId(edge.id);
  };

  const reconnectWorkflowEdge = (
    oldEdge: Edge,
    connection: Connection
  ): void => {
    const error = invalidConnectionMessage(
      definition,
      connection,
      agent,
      oldEdge.id
    );
    if (error) {
      setLocalValidationError("INVALID_CONNECTION", error, [
        "edges",
        oldEdge.id
      ]);
      return;
    }
    const source = connection.source!;
    const target = connection.target!;
    updateDefinition((current) => ({
      ...current,
      edges: current.edges.map((edge) =>
        edge.id === oldEdge.id
          ? {
              ...edge,
              sourceNodeId: source,
              targetNodeId: target
            }
          : edge
      )
    }));
    setSelectedNodeId(null);
    setSelectedEdgeId(oldEdge.id);
  };

  const updateNodePosition = (
    nodeId: string,
    position: LayoutPoint | undefined
  ): void => {
    if (!position) {
      return;
    }
    updateDefinition((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, position: roundPosition(position) }
          : node
      )
    }));
  };

  const formatWorkflow = (): void => {
    updateDefinition((current) => {
      const layout = workflowLayout(current);
      return {
        ...current,
        nodes: current.nodes.map((node) => ({
          ...node,
          position: layout.get(node.id) ?? node.position
        }))
      };
    });
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

  const removeSelectedEdge = (): void => {
    if (!selectedEdge) {
      return;
    }
    updateDefinition((current) => ({
      ...current,
      edges: current.edges.filter((edge) => edge.id !== selectedEdge.id)
    }));
    setSelectedEdgeId(null);
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
            onNodesDelete={(deletedNodes) => {
              if (readOnly) {
                return;
              }
              const deletedIds = new Set(
                deletedNodes
                  .filter((node) => node.id !== "start")
                  .map((node) => node.id)
              );
              if (deletedIds.size === 0) {
                return;
              }
              updateDefinition((current) => ({
                ...current,
                nodes: current.nodes.filter((node) => !deletedIds.has(node.id)),
                edges: current.edges.filter(
                  (edge) =>
                    !deletedIds.has(edge.sourceNodeId) &&
                    !deletedIds.has(edge.targetNodeId)
                )
              }));
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            onEdgesDelete={(deletedEdges) => {
              if (readOnly) {
                return;
              }
              const deletedIds = new Set(deletedEdges.map((edge) => edge.id));
              updateDefinition((current) => ({
                ...current,
                edges: current.edges.filter((edge) => !deletedIds.has(edge.id))
              }));
              setSelectedEdgeId(null);
            }}
            onConnect={connectNodes}
            onReconnect={reconnectWorkflowEdge}
            onNodeDragStop={(_, node) =>
              updateNodePosition(node.id, node.position)
            }
            isValidConnection={(connection) =>
              !invalidConnectionMessage(definition, connection, agent)
            }
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesReconnectable={!readOnly}
            reconnectRadius={18}
            connectionMode={ConnectionMode.Loose}
            edgesFocusable
            elementsSelectable
            deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
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
              <div className="workflow-edge-summary">
                <span>{selectedEdge.sourceNodeId}</span>
                <span aria-hidden="true">to</span>
                <span>{selectedEdge.targetNodeId}</span>
              </div>
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
              <button
                className="danger-button"
                type="button"
                disabled={readOnly}
                onClick={removeSelectedEdge}
              >
                Delete edge
              </button>
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
            disabled={readOnly}
            onClick={formatWorkflow}
          >
            Format graph
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
  const layout = workflowLayout(definition);
  return definition.nodes.map((node) => ({
    id: node.id,
    data: { label: node.label ?? node.type },
    position: node.position ?? layout.get(node.id) ?? { x: 0, y: 0 },
    type: "default",
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
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
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
    reconnectable: true,
    className:
      edge.condition?.type === "previousStep.failed"
        ? "workflow-edge-failure"
        : ""
  }));
}

function workflowLayout(
  definition: AgentWorkflowDefinition
): ReadonlyMap<string, LayoutPoint> {
  const nodeIds = new Set(definition.nodes.map((node) => node.id));
  const outgoing = new Map<string, string[]>();
  for (const node of definition.nodes) {
    outgoing.set(node.id, []);
  }
  for (const edge of definition.edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
      continue;
    }
    outgoing.get(edge.sourceNodeId)!.push(edge.targetNodeId);
  }

  const mainPath = mainWorkflowPath(definition, outgoing);
  const mainPathIds = new Set(mainPath);
  const columns = new Map<string, number>(
    mainPath.map((nodeId, index) => [nodeId, index])
  );
  const queue = [mainPath[0] ?? "start"].filter((id) => nodeIds.has(id));
  let relaxations = 0;
  const relaxationLimit = Math.max(1, definition.nodes.length * 4);
  while (queue.length > 0) {
    relaxations += 1;
    if (relaxations > relaxationLimit) {
      break;
    }
    const source = queue.shift()!;
    const nextColumn = (columns.get(source) ?? 0) + 1;
    for (const target of outgoing.get(source) ?? []) {
      if ((columns.get(target) ?? -1) < nextColumn) {
        columns.set(target, nextColumn);
        if (!queue.includes(target)) {
          queue.push(target);
        }
      }
    }
  }

  const rowsByColumn = new Map<number, number>();
  return new Map(
    definition.nodes.map((node) => {
      const column =
        columns.get(node.id) ??
        (node.type === "complete" || node.type === "fail" ? 4 : 1);
      const row = mainPathIds.has(node.id)
        ? 0
        : (rowsByColumn.get(column) ?? 1);
      if (!mainPathIds.has(node.id)) {
        rowsByColumn.set(column, row + 1);
      }
      return [
        node.id,
        {
          x: column * COLUMN_GAP,
          y: row * ROW_GAP
        }
      ];
    })
  );
}

function mainWorkflowPath(
  definition: AgentWorkflowDefinition,
  outgoing: ReadonlyMap<string, readonly string[]>
): string[] {
  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
  const edgesBySource = new Map<string, AgentWorkflowEdge[]>();
  for (const edge of definition.edges) {
    const edges = edgesBySource.get(edge.sourceNodeId) ?? [];
    edges.push(edge);
    edgesBySource.set(edge.sourceNodeId, edges);
  }

  const path: string[] = [];
  const visited = new Set<string>();
  let current = definition.nodes.find((node) => node.type === "start")?.id;
  while (current && !visited.has(current) && nodesById.has(current)) {
    path.push(current);
    visited.add(current);
    const node = nodesById.get(current)!;
    if (node.type === "complete" || node.type === "fail") {
      break;
    }
    const nextEdge = [...(edgesBySource.get(current) ?? [])]
      .filter((edge) => !visited.has(edge.targetNodeId))
      .sort((left, right) => edgePriority(left) - edgePriority(right))[0];
    current = nextEdge?.targetNodeId ?? outgoing.get(current)?.[0];
  }
  return path;
}

function edgePriority(edge: AgentWorkflowEdge): number {
  const condition = edge.condition ?? { type: "always" };
  if (condition.type === "always") {
    return 0;
  }
  if (
    condition.type === "tool.enabled" ||
    condition.type === "field.exists" ||
    condition.type === "connection.exists" ||
    condition.type === "previousStep.succeeded"
  ) {
    return 1;
  }
  if (condition.type === "previousStep.failed") {
    return 10;
  }
  return 5;
}

function invalidConnectionMessage(
  definition: AgentWorkflowDefinition,
  connection: { source?: string | null; target?: string | null },
  agent: AgentDefinition,
  replacingEdgeId?: string
): string | null {
  if (!connection.source || !connection.target) {
    return "Choose both a source and a target node.";
  }
  if (connection.source === connection.target) {
    return "A node cannot connect to itself.";
  }

  const nodesById = new Map(definition.nodes.map((node) => [node.id, node]));
  const sourceNode = nodesById.get(connection.source);
  const targetNode = nodesById.get(connection.target);
  if (!sourceNode || !targetNode) {
    return "This connection references a missing node.";
  }
  if (targetNode.type === "start") {
    return "Start cannot have incoming connections.";
  }
  if (sourceNode.type === "complete" || sourceNode.type === "fail") {
    return "Complete and Fail are terminal nodes and cannot connect forward.";
  }

  const toolId = toolIdForNode(targetNode);
  if (toolId && !agent.enabledToolIds.includes(toolId)) {
    return `Enable ${toolId} for this agent before adding that workflow step.`;
  }

  const duplicate = definition.edges.some(
    (edge) =>
      edge.id !== replacingEdgeId &&
      edge.sourceNodeId === connection.source &&
      edge.targetNodeId === connection.target
  );
  if (duplicate) {
    return "That connection already exists.";
  }

  const nextEdges = definition.edges
    .filter((edge) => edge.id !== replacingEdgeId)
    .concat({
      id: replacingEdgeId ?? "draft-edge",
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
      condition: { type: "always" }
    });
  if (createsCycle(connection.source, nextEdges)) {
    return "This connection would create a cycle, which is not supported.";
  }

  return null;
}

function createsCycle(
  startNodeId: string,
  edges: readonly AgentWorkflowEdge[]
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }
    visiting.add(nodeId);
    for (const target of outgoing.get(nodeId) ?? []) {
      if (visit(target)) {
        return true;
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  return visit(startNodeId);
}

function toolIdForNode(node: AgentWorkflowNode): string | null {
  if (
    node.type === "knowledge.search" ||
    node.type === "news.fetch_rss" ||
    node.type === "usage.summary" ||
    node.type === "gmail.search_threads" ||
    node.type === "gmail.get_thread" ||
    node.type === "gmail.create_draft" ||
    node.type === "gmail.update_draft"
  ) {
    return node.type;
  }
  return null;
}

function roundPosition(position: LayoutPoint): LayoutPoint {
  return {
    x: Math.round(position.x),
    y: Math.round(position.y)
  };
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
