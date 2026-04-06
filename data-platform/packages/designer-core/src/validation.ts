import { isValidCron } from "cron-validator";

import type { PipelineNodeDefinition, PipelineSpec, ValidationIssue } from "@data-platform/types";

import { nodeCatalogMap } from "./catalog";
import { duplicateEdges, hasCycle } from "./graph";

function requiredConfigMissing(node: PipelineNodeDefinition) {
  const catalog = nodeCatalogMap[node.type];
  if (!catalog) return ["type"];
  return catalog.fields
    .filter((field) => field.required)
    .filter((field) => {
      const value = node.config[field.key];
      return value === undefined || value === null || value === "";
    })
    .map((field) => field.key);
}

export function validatePipelineSpec(spec: PipelineSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (spec.nodes.length === 0) {
    issues.push({ code: "empty_pipeline", message: "Pipeline must include at least one node.", severity: "error" });
    return issues;
  }

  const nodeIds = new Set<string>();
  for (const node of spec.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({ code: "duplicate_node_id", message: `Duplicate node id: ${node.id}`, severity: "error", nodeId: node.id });
    }
    nodeIds.add(node.id);

    if (!nodeCatalogMap[node.type]) {
      issues.push({ code: "invalid_node_type", message: `Unsupported node type: ${node.type}`, severity: "error", nodeId: node.id });
    }

    const missing = requiredConfigMissing(node);
    if (missing.length > 0) {
      issues.push({
        code: "missing_required_config",
        message: `Node ${node.name} is missing required config: ${missing.join(", ")}`,
        severity: "error",
        nodeId: node.id
      });
    }
  }

  const duplicates = duplicateEdges(spec.edges);
  for (const edge of spec.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({
        code: "missing_edge_node",
        message: `Edge ${edge.id} points to a missing node.`,
        severity: "error",
        edgeId: edge.id
      });
    }
    if (edge.source === edge.target) {
      issues.push({ code: "self_loop", message: `Edge ${edge.id} is a self-loop.`, severity: "error", edgeId: edge.id });
    }
    if (duplicates.has(edge.id)) {
      issues.push({ code: "duplicate_edge", message: `Duplicate edge detected for ${edge.source} -> ${edge.target}.`, severity: "error", edgeId: edge.id });
    }
  }

  if (hasCycle(spec)) {
    issues.push({ code: "cycle_detected", message: "Pipeline contains a cycle.", severity: "error" });
  }

  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  for (const node of spec.nodes) {
    inbound.set(node.id, 0);
    outbound.set(node.id, 0);
  }
  for (const edge of spec.edges) {
    inbound.set(edge.target, (inbound.get(edge.target) ?? 0) + 1);
    outbound.set(edge.source, (outbound.get(edge.source) ?? 0) + 1);
  }

  if (!spec.nodes.some((node) => (inbound.get(node.id) ?? 0) === 0)) {
    issues.push({ code: "missing_root_node", message: "Pipeline must have at least one root node.", severity: "error" });
  }
  if (!spec.nodes.some((node) => (outbound.get(node.id) ?? 0) === 0)) {
    issues.push({ code: "missing_terminal_node", message: "Pipeline must have at least one terminal node.", severity: "error" });
  }

  if (spec.schedule.mode === "cron" && (!spec.schedule.cron || !isValidCron(spec.schedule.cron, { seconds: false, alias: true }))) {
    issues.push({ code: "invalid_cron", message: "Schedule mode cron requires a valid cron expression.", severity: "error" });
  }

  return issues;
}
