export type ArtifactType = "notebook" | "sql" | "python" | "pipeline" | "config" | "job";
export type PublishState = "draft" | "published";
export type RunState = "pending" | "queued" | "running" | "success" | "failed" | "retrying" | "skipped" | "cancelled";
export type ValidationSeverity = "error" | "warning";
export type ScheduleMode = "manual" | "cron" | "event";
export type NodeCategory = "source" | "transform" | "sink";
export type PipelineNodeType =
  | "source.postgres"
  | "source.s3"
  | "transform.python"
  | "transform.sql"
  | "sink.snowflake"
  | "sink.bigquery"
  | "sink.cache_log";

export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

export interface Workspace extends Timestamped {
  id: string;
  name: string;
  slug: string;
}

export interface Repo extends Timestamped {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string;
  rootPath: string;
}

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  kind: "folder" | "artifact";
  artifactType?: ArtifactType;
  children?: TreeNode[];
}

export interface Artifact extends Timestamped {
  id: string;
  repoId: string;
  parentPath: string;
  name: string;
  path: string;
  artifactType: ArtifactType;
  publishState: PublishState;
  latestVersion: number;
}

export interface ArtifactVersion extends Timestamped {
  id: string;
  artifactId: string;
  version: number;
  content: string;
  metadata: Record<string, unknown>;
  publishState: PublishState;
}

export interface RetryPolicy {
  retries: number;
  backoffSeconds: number;
}

export interface TimeoutPolicy {
  executionSeconds: number;
}

export interface ResourceHints {
  cpu: string;
  memory: string;
  pool?: string;
}

export interface PipelineNodeDefinition {
  id: string;
  type: PipelineNodeType;
  name: string;
  description: string;
  category: NodeCategory;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  retry: RetryPolicy;
  timeout: TimeoutPolicy;
  resources: ResourceHints;
  tags?: string[];
}

export interface PipelineEdgeDefinition {
  id: string;
  source: string;
  target: string;
}

export interface PipelineSchedule {
  mode: ScheduleMode;
  cron?: string | null;
  timezone?: string | null;
}

export interface PipelineDefaults {
  retry: RetryPolicy;
  timeout: TimeoutPolicy;
  resources: ResourceHints;
}

export interface PipelineMetadata {
  owner: string;
  labels: Record<string, string>;
  repoPath: string;
}

export interface PipelineSpec {
  pipelineId: string;
  name: string;
  description: string;
  version: number;
  schedule: PipelineSchedule;
  defaults: PipelineDefaults;
  nodes: PipelineNodeDefinition[];
  edges: PipelineEdgeDefinition[];
  metadata: PipelineMetadata;
}

export interface ValidationIssue {
  code:
    | "empty_pipeline"
    | "duplicate_node_id"
    | "missing_edge_node"
    | "self_loop"
    | "cycle_detected"
    | "missing_required_config"
    | "missing_root_node"
    | "missing_terminal_node"
    | "invalid_cron"
    | "invalid_node_type"
    | "duplicate_edge";
  message: string;
  severity: ValidationSeverity;
  nodeId?: string;
  edgeId?: string;
}

export interface PipelineRecord extends Timestamped {
  id: string;
  artifactId: string;
  name: string;
  description: string;
  publishState: PublishState;
  currentVersion: number;
  spec: PipelineSpec;
}

export interface PipelineRun extends Timestamped {
  id: string;
  pipelineId: string;
  version: number;
  state: RunState;
  trigger: ScheduleMode;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface TaskRun extends Timestamped {
  id: string;
  pipelineRunId: string;
  nodeId: string;
  nodeName: string;
  state: RunState;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface RunLog {
  id: string;
  runId: string;
  taskRunId?: string | null;
  level: "log" | "info" | "warn";
  message: string;
  timestamp: string;
}

export interface NodeCatalogField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "select";
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface NodeCatalogItem {
  type: PipelineNodeType;
  label: string;
  description: string;
  category: NodeCategory;
  defaultConfig: Record<string, unknown>;
  fields: NodeCatalogField[];
}
