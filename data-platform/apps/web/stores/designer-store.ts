"use client";

import type { PipelineEdgeDefinition, PipelineNodeDefinition, PipelineNodeType, PipelineSpec, ValidationIssue } from "@data-platform/types";

import { nodeCatalogMap, validatePipelineSpec } from "@data-platform/designer-core";
import { create } from "zustand";

interface DesignerState {
  spec: PipelineSpec;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  issues: ValidationIssue[];
  dirty: boolean;
  loadSpec(spec: PipelineSpec): void;
  addNode(type: PipelineNodeType): void;
  updateNode(nodeId: string, partial: Partial<PipelineNodeDefinition>): void;
  updateNodeConfig(nodeId: string, key: string, value: unknown): void;
  connectNodes(source: string, target: string): void;
  updateNodePosition(nodeId: string, position: { x: number; y: number }): void;
  selectNode(nodeId?: string): void;
  selectEdge(edgeId?: string): void;
  deleteSelection(): void;
  validate(): ValidationIssue[];
  markClean(): void;
}

function cloneSpec(spec: PipelineSpec): PipelineSpec {
  return JSON.parse(JSON.stringify(spec)) as PipelineSpec;
}

function makeNode(type: PipelineNodeType, index: number): PipelineNodeDefinition {
  const catalog = nodeCatalogMap[type];
  return {
    id: `${type.replace(".", "_")}_${index}`,
    type,
    name: catalog.label,
    description: catalog.description,
    category: catalog.category,
    position: { x: 120 + index * 40, y: 120 + index * 40 },
    config: { ...catalog.defaultConfig },
    retry: { retries: 1, backoffSeconds: 60 },
    timeout: { executionSeconds: 900 },
    resources: { cpu: "500m", memory: "1Gi", pool: "default" },
    tags: []
  };
}

export const useDesignerStore = create<DesignerState>((set, get) => ({
  spec: {
    pipelineId: "draft_pipeline",
    name: "Untitled Pipeline",
    description: "",
    version: 1,
    schedule: { mode: "manual", cron: null, timezone: "UTC" },
    defaults: {
      retry: { retries: 1, backoffSeconds: 60 },
      timeout: { executionSeconds: 900 },
      resources: { cpu: "500m", memory: "1Gi", pool: "default" }
    },
    nodes: [],
    edges: [],
    metadata: { owner: "demo@acme.io", labels: {}, repoPath: "workspaces/acme/repos/analytics-platform/pipelines" }
  },
  issues: [],
  dirty: false,
  loadSpec(spec) {
    set({ spec: cloneSpec(spec), selectedNodeId: undefined, selectedEdgeId: undefined, issues: [], dirty: false });
  },
  addNode(type) {
    set((state) => {
      const next = cloneSpec(state.spec);
      next.nodes.push(makeNode(type, next.nodes.length + 1));
      return { spec: next, dirty: true };
    });
  },
  updateNode(nodeId, partial) {
    set((state) => {
      const next = cloneSpec(state.spec);
      next.nodes = next.nodes.map((node) => (node.id === nodeId ? { ...node, ...partial } : node));
      return { spec: next, dirty: true };
    });
  },
  updateNodeConfig(nodeId, key, value) {
    set((state) => {
      const next = cloneSpec(state.spec);
      next.nodes = next.nodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              config: {
                ...node.config,
                [key]: value
              }
            }
          : node
      );
      return { spec: next, dirty: true };
    });
  },
  connectNodes(source, target) {
    set((state) => {
      const next = cloneSpec(state.spec);
      const edge: PipelineEdgeDefinition = { id: `edge_${source}_${target}`, source, target };
      next.edges.push(edge);
      return { spec: next, selectedEdgeId: edge.id, dirty: true };
    });
  },
  updateNodePosition(nodeId, position) {
    set((state) => {
      const next = cloneSpec(state.spec);
      next.nodes = next.nodes.map((node) => (node.id === nodeId ? { ...node, position } : node));
      return { spec: next, dirty: true };
    });
  },
  selectNode(nodeId) {
    set({ selectedNodeId: nodeId, selectedEdgeId: undefined });
  },
  selectEdge(edgeId) {
    set({ selectedEdgeId: edgeId, selectedNodeId: undefined });
  },
  deleteSelection() {
    set((state) => {
      const next = cloneSpec(state.spec);
      if (state.selectedNodeId) {
        next.nodes = next.nodes.filter((node) => node.id !== state.selectedNodeId);
        next.edges = next.edges.filter((edge) => edge.source !== state.selectedNodeId && edge.target !== state.selectedNodeId);
      }
      if (state.selectedEdgeId) {
        next.edges = next.edges.filter((edge) => edge.id !== state.selectedEdgeId);
      }
      return { spec: next, selectedNodeId: undefined, selectedEdgeId: undefined, dirty: true };
    });
  },
  validate() {
    const issues = validatePipelineSpec(get().spec);
    set({ issues });
    return issues;
  },
  markClean() {
    set({ dirty: false });
  }
}));
