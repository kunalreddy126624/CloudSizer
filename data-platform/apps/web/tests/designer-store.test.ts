import { describe, expect, it } from "vitest";

import { useDesignerStore } from "@/stores/designer-store";

describe("designer store", () => {
  it("adds nodes and validates missing terminal structure", () => {
    const store = useDesignerStore.getState();
    store.loadSpec({
      pipelineId: "test",
      name: "Test",
      description: "",
      version: 1,
      schedule: { mode: "manual", cron: null, timezone: "UTC" },
      defaults: {
        retry: { retries: 1, backoffSeconds: 60 },
        timeout: { executionSeconds: 600 },
        resources: { cpu: "500m", memory: "1Gi", pool: "default" }
      },
      nodes: [],
      edges: [],
      metadata: { owner: "demo", labels: {}, repoPath: "pipelines" }
    });
    store.addNode("source.postgres");
    store.addNode("sink.snowflake");
    const sourceNode = useDesignerStore.getState().spec.nodes[0];
    const sinkNode = useDesignerStore.getState().spec.nodes[1];
    useDesignerStore.getState().connectNodes(sourceNode.id, sinkNode.id);
    const issues = useDesignerStore.getState().validate();
    expect(issues.some((issue) => issue.code === "missing_required_config")).toBe(true);
  });
});
