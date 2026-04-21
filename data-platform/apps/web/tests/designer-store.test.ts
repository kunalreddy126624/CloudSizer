import { describe, expect, it } from "vitest";

import { useDesignerStore } from "@/stores/designer-store";

function createBaseSpec() {
  return {
    pipelineId: "test",
    name: "Test",
    description: "",
    version: 1,
    schedule: { mode: "manual" as const, cron: null, timezone: "UTC" },
    defaults: {
      retry: { retries: 1, backoffSeconds: 60 },
      timeout: { executionSeconds: 600 },
      resources: { cpu: "500m", memory: "1Gi", pool: "default" }
    },
    nodes: [],
    edges: [],
    metadata: { owner: "demo", labels: {}, repoPath: "pipelines" }
  };
}

describe("designer store", () => {
  it("adds nodes and validates missing terminal structure", () => {
    const store = useDesignerStore.getState();
    store.loadSpec(createBaseSpec());
    store.addNode("source.postgres");
    store.addNode("sink.snowflake");
    const sourceNode = useDesignerStore.getState().spec.nodes[0];
    const sinkNode = useDesignerStore.getState().spec.nodes[1];
    expect(sourceNode).toBeDefined();
    expect(sinkNode).toBeDefined();
    if (!sourceNode || !sinkNode) {
      throw new Error("Expected source and sink nodes to be created.");
    }
    useDesignerStore.getState().connectNodes(sourceNode.id, sinkNode.id);
    const issues = useDesignerStore.getState().validate();
    expect(issues.some((issue) => issue.code === "missing_required_config")).toBe(true);
  });

  it("replaces the workflow from a prompt", () => {
    const store = useDesignerStore.getState();
    store.loadSpec(createBaseSpec());

    const summary = store.applyPrompt("Build a daily workflow from Postgres with SQL and load it into Snowflake.", "replace");
    const state = useDesignerStore.getState();

    expect(summary).toContain("Generated");
    expect(state.spec.nodes.map((node) => node.type)).toEqual(["source.postgres", "transform.sql", "sink.snowflake"]);
    expect(state.spec.schedule.mode).toBe("cron");
    expect(state.spec.schedule.cron).toBe("0 6 * * *");
  });

  it("appends inferred steps without removing existing ones", () => {
    const store = useDesignerStore.getState();
    store.loadSpec(createBaseSpec());
    store.applyPrompt("Build a manual workflow from Postgres with SQL and load it into Snowflake.", "replace");

    const summary = store.applyPrompt("Add a cache log preview step and run hourly.", "append");
    const state = useDesignerStore.getState();

    expect(summary).toContain("Added Cache Log.");
    expect(state.spec.nodes.map((node) => node.type)).toEqual([
      "source.postgres",
      "transform.sql",
      "sink.snowflake",
      "sink.cache_log"
    ]);
    expect(state.spec.schedule.mode).toBe("cron");
    expect(state.spec.schedule.cron).toBe("0 * * * *");
  });
});
