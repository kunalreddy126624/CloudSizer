import { describe, expect, it } from "vitest";

import type { PipelineSpec } from "@data-platform/types";

import { validatePipelineSpec } from "../src/validation";

const baseSpec: PipelineSpec = {
  pipelineId: "pipeline_1",
  name: "Valid Pipeline",
  description: "Validation test pipeline",
  version: 1,
  schedule: { mode: "manual", cron: null, timezone: "UTC" },
  defaults: {
    retry: { retries: 1, backoffSeconds: 30 },
    timeout: { executionSeconds: 300 },
    resources: { cpu: "500m", memory: "512Mi", pool: "default" }
  },
  metadata: { owner: "owner", labels: {}, repoPath: "pipelines/valid.json" },
  nodes: [
    {
      id: "source_1",
      type: "source.postgres",
      name: "Source",
      description: "Source",
      category: "source",
      position: { x: 0, y: 0 },
      config: { connectionId: "conn", query: "select 1" },
      retry: { retries: 1, backoffSeconds: 30 },
      timeout: { executionSeconds: 300 },
      resources: { cpu: "500m", memory: "512Mi", pool: "default" }
    },
    {
      id: "sink_1",
      type: "sink.bigquery",
      name: "Sink",
      description: "Sink",
      category: "sink",
      position: { x: 200, y: 0 },
      config: { connectionId: "conn", dataset: "demo", table: "items" },
      retry: { retries: 1, backoffSeconds: 30 },
      timeout: { executionSeconds: 300 },
      resources: { cpu: "500m", memory: "512Mi", pool: "default" }
    }
  ],
  edges: [{ id: "edge_1", source: "source_1", target: "sink_1" }]
};

describe("validatePipelineSpec", () => {
  it("accepts a valid DAG", () => {
    expect(validatePipelineSpec(baseSpec)).toEqual([]);
  });

  it("detects a cycle", () => {
    const spec = {
      ...baseSpec,
      edges: [
        ...baseSpec.edges,
        { id: "edge_2", source: "sink_1", target: "source_1" }
      ]
    };
    expect(validatePipelineSpec(spec).some((issue) => issue.code === "cycle_detected")).toBe(true);
  });

  it("detects duplicate edges", () => {
    const spec = {
      ...baseSpec,
      edges: [
        ...baseSpec.edges,
        { id: "edge_2", source: "source_1", target: "sink_1" }
      ]
    };
    expect(validatePipelineSpec(spec).some((issue) => issue.code === "duplicate_edge")).toBe(true);
  });
});
