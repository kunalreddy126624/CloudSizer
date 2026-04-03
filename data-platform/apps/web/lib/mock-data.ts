import type { PipelineRecord, PipelineRun, Repo, TreeNode } from "@data-platform/types";

const examplePipeline = {
  pipelineId: "pipeline_daily_sales",
  name: "Daily Sales Pipeline",
  description: "Extract daily sales from Postgres, transform with Python, and load into Snowflake.",
  version: 1,
  schedule: {
    mode: "cron",
    cron: "0 6 * * *",
    timezone: "UTC"
  },
  defaults: {
    retry: { retries: 2, backoffSeconds: 60 },
    timeout: { executionSeconds: 900 },
    resources: { cpu: "500m", memory: "1Gi", pool: "etl-small" }
  },
  nodes: [
    {
      id: "source_sales_postgres",
      type: "source.postgres",
      name: "Postgres Sales Source",
      description: "Read daily sales rows from Postgres.",
      category: "source",
      position: { x: 80, y: 140 },
      config: {
        connectionId: "conn_postgres_analytics",
        query: "select * from sales where order_date = current_date - interval '1 day'"
      },
      retry: { retries: 2, backoffSeconds: 60 },
      timeout: { executionSeconds: 600 },
      resources: { cpu: "500m", memory: "1Gi", pool: "etl-small" },
      tags: ["sales", "daily"]
    },
    {
      id: "transform_sales_python",
      type: "transform.python",
      name: "Normalize Sales",
      description: "Apply Python normalization and business logic.",
      category: "transform",
      position: { x: 380, y: 140 },
      config: {
        entrypoint: "jobs/sales_transform.py",
        functionName: "run"
      },
      retry: { retries: 1, backoffSeconds: 30 },
      timeout: { executionSeconds: 900 },
      resources: { cpu: "1", memory: "2Gi", pool: "etl-medium" },
      tags: ["python"]
    },
    {
      id: "sink_sales_snowflake",
      type: "sink.snowflake",
      name: "Snowflake Daily Sales",
      description: "Write transformed daily sales into Snowflake.",
      category: "sink",
      position: { x: 700, y: 140 },
      config: {
        connectionId: "conn_snowflake_finance",
        database: "ANALYTICS",
        schema: "PUBLIC",
        table: "DAILY_SALES"
      },
      retry: { retries: 2, backoffSeconds: 60 },
      timeout: { executionSeconds: 900 },
      resources: { cpu: "500m", memory: "1Gi", pool: "etl-small" },
      tags: ["warehouse"]
    }
  ],
  edges: [
    { id: "edge_1", source: "source_sales_postgres", target: "transform_sales_python" },
    { id: "edge_2", source: "transform_sales_python", target: "sink_sales_snowflake" }
  ],
  metadata: {
    owner: "data-platform@acme.io",
    labels: { domain: "sales", tier: "gold" },
    repoPath: "workspaces/acme/repos/analytics-platform/pipelines/daily_sales.pipeline.json"
  }
};

export const mockRepo: Repo = {
  id: "repo_analytics",
  workspaceId: "ws_acme",
  name: "analytics-platform",
  slug: "analytics-platform",
  description: "Core analytics workspace repository.",
  rootPath: "workspaces/acme/repos/analytics-platform",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const mockTree: TreeNode = {
  id: "root",
  name: "analytics-platform",
  path: mockRepo.rootPath,
  kind: "folder",
  children: [
    {
      id: "pipelines",
      name: "pipelines",
      path: `${mockRepo.rootPath}/pipelines`,
      kind: "folder",
      children: [
        {
          id: "art_daily_sales",
          name: "daily_sales.pipeline.json",
          path: `${mockRepo.rootPath}/pipelines/daily_sales.pipeline.json`,
          kind: "artifact",
          artifactType: "pipeline"
        }
      ]
    },
    {
      id: "sql",
      name: "sql",
      path: `${mockRepo.rootPath}/sql`,
      kind: "folder",
      children: []
    },
    {
      id: "jobs",
      name: "jobs",
      path: `${mockRepo.rootPath}/jobs`,
      kind: "folder",
      children: []
    }
  ]
};

export const mockPipeline: PipelineRecord = {
  id: "pl_daily_sales",
  artifactId: "art_daily_sales",
  name: "Daily Sales Pipeline",
  description: "Extract daily sales from Postgres and load Snowflake.",
  publishState: "draft",
  currentVersion: 1,
  spec: examplePipeline,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

export const mockRuns: PipelineRun[] = [
  {
    id: "run_pl_daily_sales_1",
    pipelineId: mockPipeline.id,
    version: 1,
    state: "success",
    trigger: "manual",
    startedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    finishedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    createdAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60_000).toISOString()
  }
];
