import type { NodeCatalogItem, PipelineNodeType } from "@data-platform/types";

export const nodeCatalog: NodeCatalogItem[] = [
  {
    type: "source.postgres",
    label: "Postgres Source",
    description: "Extract rows from a Postgres database.",
    category: "source",
    defaultConfig: { connectionId: "", query: "select * from table_name" },
    fields: [
      { key: "connectionId", label: "Connection", type: "text", required: true },
      { key: "query", label: "SQL Query", type: "textarea", required: true }
    ]
  },
  {
    type: "source.s3",
    label: "S3 Source",
    description: "Read files from S3-compatible object storage.",
    category: "source",
    defaultConfig: { connectionId: "", bucket: "", prefix: "" },
    fields: [
      { key: "connectionId", label: "Connection", type: "text", required: true },
      { key: "bucket", label: "Bucket", type: "text", required: true },
      { key: "prefix", label: "Prefix", type: "text" }
    ]
  },
  {
    type: "transform.python",
    label: "Python Transform",
    description: "Run Python transformation logic.",
    category: "transform",
    defaultConfig: { entrypoint: "", functionName: "run" },
    fields: [
      { key: "entrypoint", label: "Entrypoint", type: "text", required: true },
      { key: "functionName", label: "Function", type: "text", required: true }
    ]
  },
  {
    type: "transform.sql",
    label: "SQL Transform",
    description: "Transform data with SQL.",
    category: "transform",
    defaultConfig: { dialect: "ansi", sql: "select * from input_table" },
    fields: [
      { key: "dialect", label: "Dialect", type: "select", options: ["ansi", "spark", "snowflake"], required: true },
      { key: "sql", label: "SQL", type: "textarea", required: true }
    ]
  },
  {
    type: "sink.snowflake",
    label: "Snowflake Sink",
    description: "Load into Snowflake.",
    category: "sink",
    defaultConfig: { connectionId: "", database: "", schema: "", table: "" },
    fields: [
      { key: "connectionId", label: "Connection", type: "text", required: true },
      { key: "database", label: "Database", type: "text", required: true },
      { key: "schema", label: "Schema", type: "text", required: true },
      { key: "table", label: "Table", type: "text", required: true }
    ]
  },
  {
    type: "sink.bigquery",
    label: "BigQuery Sink",
    description: "Load into BigQuery.",
    category: "sink",
    defaultConfig: { connectionId: "", dataset: "", table: "" },
    fields: [
      { key: "connectionId", label: "Connection", type: "text", required: true },
      { key: "dataset", label: "Dataset", type: "text", required: true },
      { key: "table", label: "Table", type: "text", required: true }
    ]
  },
  {
    type: "sink.cache_log",
    label: "Cache Log",
    description: "Capture node output into cache-backed run logs.",
    category: "sink",
    defaultConfig: { connectionId: "", cacheKey: "", format: "json" },
    fields: [
      { key: "connectionId", label: "Connection", type: "text", required: true },
      { key: "cacheKey", label: "Cache Key", type: "text", required: true },
      { key: "format", label: "Format", type: "select", options: ["json", "text"], required: true }
    ]
  }
];

export const nodeCatalogMap: Record<PipelineNodeType, NodeCatalogItem> = Object.fromEntries(
  nodeCatalog.map((item) => [item.type, item])
) as Record<PipelineNodeType, NodeCatalogItem>;
