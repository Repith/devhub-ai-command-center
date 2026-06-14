"use client";

import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node
} from "@xyflow/react";

import type { AgentDefinition } from "@devhub/contracts";

import {
  workflowPreviewForAgent,
  type WorkflowPreviewGraph,
  type WorkflowPreviewNode
} from "../lib/agent-workflow-preview-data";

interface AgentWorkflowPreviewProps {
  agent: AgentDefinition;
  status?: "error" | "loading" | "success";
}

const COLUMN_GAP = 230;
const ROW_GAP = 120;

export function AgentWorkflowPreview({
  agent,
  status = "success"
}: AgentWorkflowPreviewProps): React.JSX.Element | null {
  if (status === "loading") {
    return (
      <section
        className="workflow-preview workflow-preview-state"
        aria-live="polite"
      >
        <div className="loader" aria-hidden="true" />
        <p>Loading workflow preview...</p>
      </section>
    );
  }
  if (status === "error") {
    return (
      <section className="workflow-preview workflow-preview-state">
        <p role="alert">Workflow preview could not be loaded.</p>
      </section>
    );
  }

  const graph = workflowPreviewForAgent(agent);
  if (!graph) {
    return (
      <section className="workflow-preview workflow-preview-state">
        <p>No workflow preview is available for this agent yet.</p>
      </section>
    );
  }

  return (
    <section
      className="workflow-preview"
      aria-labelledby="workflow-preview-heading"
    >
      <div className="workflow-preview-heading">
        <div>
          <p className="section-kicker">Workflow preview</p>
          <h3 id="workflow-preview-heading">{graph.title}</h3>
        </div>
        <span>{graph.nodes.length} steps</span>
      </div>
      <div className="workflow-preview-canvas" aria-label={graph.title}>
        <ReactFlow
          nodes={toFlowNodes(graph)}
          edges={toFlowEdges(graph)}
          fitView
          minZoom={0.45}
          maxZoom={1.35}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} color="#303543" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <ol className="workflow-preview-steps" aria-label="Workflow steps">
        {graph.nodes.map((node) => (
          <li key={node.id}>
            <span>{node.type}</span>
            <strong>{node.label}</strong>
          </li>
        ))}
      </ol>
      <ul className="workflow-preview-edges" aria-label="Workflow conditions">
        {graph.edges.map((edge) => (
          <li key={edge.id}>
            <span>{edge.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function toFlowNodes(graph: WorkflowPreviewGraph): Node[] {
  return graph.nodes.map((node) => ({
    id: node.id,
    data: { label: node.label },
    position: nodePosition(node),
    type: "default",
    className: `workflow-node workflow-node-${node.type.replace(".", "-")}`
  }));
}

function toFlowEdges(graph: WorkflowPreviewGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label === "always" ? undefined : edge.label,
    animated: edge.label !== "always",
    markerEnd: { type: MarkerType.ArrowClosed },
    className: edge.label === "on failure" ? "workflow-edge-failure" : ""
  }));
}

function nodePosition(node: WorkflowPreviewNode): { x: number; y: number } {
  return {
    x: node.column * COLUMN_GAP,
    y: node.row * ROW_GAP + (node.column % 2 === 0 ? 0 : 28)
  };
}
