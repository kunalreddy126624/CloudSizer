import { expect, test } from "@playwright/test";

import { mergeSavedNoodlePipelines } from "../src/lib/scenario-store";
import type { NoodlePipelineDesignerDocument } from "../src/lib/types";

function buildPipeline(overrides: Partial<NoodlePipelineDesignerDocument> = {}): NoodlePipelineDesignerDocument {
  return {
    id: overrides.id ?? "pipeline-1",
    name: overrides.name ?? "Operational Pipeline",
    status: overrides.status ?? "draft",
    version: overrides.version ?? 1,
    nodes: overrides.nodes ?? [],
    edges: overrides.edges ?? [],
    connection_refs: overrides.connection_refs ?? [],
    metadata_assets: overrides.metadata_assets ?? [],
    schemas: overrides.schemas ?? [],
    transformations: overrides.transformations ?? [],
    orchestrator_plan: overrides.orchestrator_plan ?? {
      id: "plan-1",
      name: "Operational Pipeline orchestrator plan",
      objective: "Coordinate the pipeline.",
      trigger: "manual",
      execution_target: "apache-airflow",
      tasks: [],
      notes: []
    },
    schedule: overrides.schedule ?? {
      trigger: "manual",
      cron: "",
      timezone: "UTC",
      enabled: false,
      concurrency_policy: "forbid",
      orchestration_mode: "tasks",
      if_condition: ""
    },
    runs: overrides.runs ?? [],
    saved_at: overrides.saved_at ?? "2026-04-03T12:00:00.000Z"
  };
}

test.describe("saved noodle pipeline merge", () => {
  test("updates an existing pipeline version without duplication", () => {
    const original = buildPipeline();
    const updated = buildPipeline({
      id: original.id,
      version: 2,
      saved_at: "2026-04-03T13:00:00.000Z"
    });

    const next = mergeSavedNoodlePipelines([original], updated);

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe(original.id);
    expect(next[0].version).toBe(2);
    expect(next[0].saved_at).toBe("2026-04-03T13:00:00.000Z");
  });

  test("moves the latest pipeline to the front of saved work", () => {
    const first = buildPipeline({ id: "pipeline-1", name: "First Pipeline" });
    const second = buildPipeline({ id: "pipeline-2", name: "Second Pipeline" });
    const updatedFirst = buildPipeline({ id: "pipeline-1", version: 3 });

    const next = mergeSavedNoodlePipelines([first, second], updatedFirst);

    expect(next.map((pipeline) => pipeline.id)).toEqual(["pipeline-1", "pipeline-2"]);
    expect(next[0].version).toBe(3);
  });
});
