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

export function sortNodesForWorkflowSteps(spec: PipelineSpec) {
  const adjacency = buildAdjacency(spec);
  const indegree = new Map(spec.nodes.map((node) => [node.id, 0]));

  for (const edge of spec.edges) {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = spec.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y);
  const ordered: typeof spec.nodes = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    ordered.push(current);
    for (const neighborId of adjacency.get(current.id) ?? []) {
      indegree.set(neighborId, (indegree.get(neighborId) ?? 0) - 1);
      if ((indegree.get(neighborId) ?? 0) === 0) {
        const neighbor = spec.nodes.find((node) => node.id === neighborId);
        if (neighbor) {
          queue.push(neighbor);
          queue.sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y);
        }
      }
    }
  }

  if (ordered.length !== spec.nodes.length) {
    const orderedIds = new Set(ordered.map((node) => node.id));
    return [
      ...ordered,
      ...spec.nodes
        .filter((node) => !orderedIds.has(node.id))
        .sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y)
    ];
  }

  return ordered;
}
