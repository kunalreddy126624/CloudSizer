import type { PipelineEdgeDefinition, PipelineSpec } from "@data-platform/types";

export function buildAdjacency(spec: PipelineSpec) {
  const adjacency = new Map<string, string[]>();
  for (const node of spec.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of spec.edges) {
    adjacency.get(edge.source)?.push(edge.target);
  }
  return adjacency;
}

export function hasCycle(spec: PipelineSpec) {
  const adjacency = buildAdjacency(spec);
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(nodeId: string): boolean {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      if (visit(neighbor)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  return spec.nodes.some((node) => visit(node.id));
}

export function duplicateEdges(edges: PipelineEdgeDefinition[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const edge of edges) {
    const key = `${edge.source}->${edge.target}`;
    if (seen.has(key)) duplicates.add(edge.id);
    seen.add(key);
  }
  return duplicates;
}
