import { describe, expect, it } from "vitest";

import {
  buildArchitectureContextPayload,
  buildDesignerMomoPayload,
  buildPipelineIntentPrompt,
  type ArchitectContextDraft,
  type NoodlePipelineIntentCatalogItem
} from "@/lib/noodle-designer";

function createSpec() {
  return {
    pipelineId: "pipe-123",
    name: "Retail Ops",
    description: "Retail operations pipeline",
    version: 2,
    schedule: { mode: "cron" as const, cron: "0 * * * *", timezone: "UTC" },
    defaults: {
      retry: { retries: 1, backoffSeconds: 60 },
      timeout: { executionSeconds: 600 },
      resources: { cpu: "500m", memory: "1Gi", pool: "default" }
    },
    nodes: [
      {
        id: "source-1",
        type: "source.postgres" as const,
        name: "Orders Source",
        description: "Read orders",
        category: "source" as const,
        position: { x: 10, y: 20 },
        config: { connectionId: "warehouse", query: "select * from orders" },
        retry: { retries: 1, backoffSeconds: 60 },
        timeout: { executionSeconds: 600 },
        resources: { cpu: "500m", memory: "1Gi", pool: "default" },
        tags: ["orders"]
      },
      {
        id: "transform-1",
        type: "transform.sql" as const,
        name: "Normalize Orders",
        description: "Normalize orders",
        category: "transform" as const,
        position: { x: 140, y: 20 },
        config: { dialect: "ansi", sql: "select * from input_table" },
        retry: { retries: 1, backoffSeconds: 60 },
        timeout: { executionSeconds: 600 },
        resources: { cpu: "500m", memory: "1Gi", pool: "default" },
        tags: []
      },
      {
        id: "sink-1",
        type: "sink.snowflake" as const,
        name: "Serve Orders",
        description: "Publish data",
        category: "sink" as const,
        position: { x: 280, y: 20 },
        config: { connectionId: "snowflake", database: "ops", schema: "gold", table: "orders" },
        retry: { retries: 1, backoffSeconds: 60 },
        timeout: { executionSeconds: 600 },
        resources: { cpu: "500m", memory: "1Gi", pool: "default" },
        tags: []
      }
    ],
    edges: [{ id: "edge-1", source: "source-1", target: "transform-1" }],
    metadata: { owner: "demo@acme.io", labels: {}, repoPath: "pipelines" }
  };
}

const architectDraft: ArchitectContextDraft = {
  name: "Retail Architect",
  prompt: "Design a resilient retail platform",
  summary: "Multi-region retail operations data plane.",
  systemDesign: "Control plane owns authoring and scheduling. Execution plane owns workers and retries.",
  selectedProviders: "aws, gcp",
  assumptions: "shared metadata plane",
  components: "scheduler, workers, metadata catalog",
  cloudServices: "eks, msk, bigquery",
  dataFlow: "sources, bronze, silver, serving",
  scalingStrategy: "scale workers independently",
  securityConsiderations: "mask pii, regional residency"
};

const catalogItem: NoodlePipelineIntentCatalogItem = {
  id: "retail-ops",
  name: "Retail Ops",
  summary: "Build a governed retail operations pipeline.",
  tags: ["retail", "ops"],
  recommendedWorkflowTemplate: "temporal-hybrid-streaming",
  intent: {
    name: "retail-ops",
    businessGoal: "Publish retail operations telemetry and serving views.",
    deploymentScope: "multi_cloud",
    latencySlo: "minutes",
    requiresMlFeatures: false,
    requiresRealtimeServing: true,
    containsSensitiveData: true,
    targetConsumers: ["ops_api", "bi"],
    sources: [
      {
        name: "orders_api",
        kind: "api",
        environment: "aws",
        formatHint: "json",
        changePattern: "append"
      }
    ]
  }
};

describe("noodle designer helpers", () => {
  it("builds architecture context payload with normalized list fields", () => {
    const payload = buildArchitectureContextPayload(architectDraft);

    expect(payload?.system_design).toContain("Control plane");
    expect(payload?.selected_providers).toEqual(["aws", "gcp"]);
    expect(payload?.components).toEqual(["scheduler", "workers", "metadata catalog"]);
  });

  it("builds a prompt from the selected intent", () => {
    const prompt = buildPipelineIntentPrompt(catalogItem);

    expect(prompt).toContain("Build a governed retail operations pipeline.");
    expect(prompt).toContain("orders_api (api)");
  });

  it("builds a designer momo payload from the current pipeline canvas", () => {
    const payload = buildDesignerMomoPayload({
      userTurn: "How should I separate control plane and workers?",
      spec: createSpec(),
      architecture: architectDraft,
      intent: catalogItem,
      maxResults: 5
    });

    expect(payload.max_results).toBe(5);
    expect(payload.pipeline_document.nodes[0]?.kind).toBe("source");
    expect(payload.pipeline_document.nodes[2]?.kind).toBe("serve");
    expect(payload.pipeline_document.transformations[0]?.mode).toBe("sql");
    expect(payload.intent?.business_goal).toContain("retail operations");
    expect(payload.architecture_context?.system_design).toContain("Execution plane");
  });
});
