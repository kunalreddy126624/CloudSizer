import type { PipelineNodeDefinition, PipelineSpec } from "@data-platform/types";

export interface NoodleSourceSystem {
  name: string;
  kind: "api" | "database" | "stream" | "file" | "iot" | "saas" | "github";
  environment: "on_prem" | "aws" | "azure" | "gcp" | "edge" | "saas";
  formatHint: string;
  changePattern: "append" | "cdc" | "event" | "snapshot";
}

export interface NoodlePipelineIntent {
  name: string;
  businessGoal: string;
  deploymentScope: "hybrid" | "multi_cloud" | "edge" | "hybrid_multi_cloud";
  latencySlo: "seconds" | "minutes" | "hours" | "daily";
  requiresMlFeatures: boolean;
  requiresRealtimeServing: boolean;
  containsSensitiveData: boolean;
  targetConsumers: string[];
  sources: NoodleSourceSystem[];
}

export interface NoodlePipelineIntentCatalogItem {
  id: string;
  name: string;
  summary: string;
  tags: string[];
  intent: NoodlePipelineIntent;
  recommendedWorkflowTemplate: string;
}

export interface NoodlePipelineIntentCatalogResponse {
  items: NoodlePipelineIntentCatalogItem[];
}

export interface ArchitectContextDraft {
  name: string;
  prompt: string;
  summary: string;
  systemDesign: string;
  selectedProviders: string;
  assumptions: string;
  components: string;
  cloudServices: string;
  dataFlow: string;
  scalingStrategy: string;
  securityConsiderations: string;
}

export interface AgentMomoSource {
  id: string;
  title: string;
  kind: string;
  score: number;
  snippet: string;
  tags: string[];
}

export interface AgentMomoResponse {
  assistant: "agent-momo";
  answer: string;
  brief: string;
  sources: AgentMomoSource[];
  retrievalBackend: string;
}

export interface AgentMomoApiPayload {
  user_turn: string;
  max_results: number;
  architecture_context?: {
    name: string;
    prompt: string;
    summary: string;
    system_design: string;
    selected_providers: string[];
    assumptions: string[];
    components: string[];
    cloud_services: string[];
    data_flow: string[];
    scaling_strategy: string[];
    security_considerations: string[];
  };
  intent?: {
    name: string;
    business_goal: string;
    deployment_scope: string;
    latency_slo: string;
    requires_ml_features: boolean;
    requires_realtime_serving: boolean;
    contains_sensitive_data: boolean;
    target_consumers: string[];
    sources: Array<{
      name: string;
      kind: string;
      environment: string;
      format_hint: string;
      change_pattern: string;
    }>;
  };
  pipeline_document: {
    id: string;
    name: string;
    status: "draft" | "published";
    version: number;
    nodes: Array<{
      id: string;
      label: string;
      kind: "source" | "ingest" | "transform" | "cache" | "quality" | "feature" | "serve";
      position: { x: number; y: number };
      params: Array<{ key: string; value: string }>;
    }>;
    edges: Array<{ id: string; source: string; target: string }>;
    connection_refs: Array<{
      id: string;
      name: string;
      plugin: string;
      environment: string;
      auth_ref: string;
      params: Array<{ key: string; value: string }>;
      notes: string;
    }>;
    metadata_assets: Array<{
      id: string;
      name: string;
      zone: "bronze" | "silver" | "gold" | "feature_store" | "serving" | "control_plane";
      owner: string;
      classification: string;
      tags: string[];
    }>;
    schemas: Array<{ id: string; name: string; source_connection_id?: string; fields: unknown[] }>;
    transformations: Array<{
      id: string;
      node_id?: string;
      name: string;
      plugin: string;
      mode: "python" | "sql" | "dbt" | "spark_sql" | "custom";
      description: string;
      code: string;
      config_json: string;
      tags: string[];
    }>;
    deployment: {
      enabled: boolean;
      deploy_target: "local_docker" | "kubernetes" | "airflow_worker" | "worker_runtime" | "custom";
      repository: {
        provider: "github" | "gitlab" | "bitbucket" | "custom";
        connection_id: string | null;
        repository: string;
        branch: string;
        backend_path: string;
        workflow_ref: string;
      };
      build_command: string;
      deploy_command: string;
      artifact_name: string;
      notes: string;
    };
    orchestrator_plan: null;
    schedule: {
      trigger: "manual" | "schedule" | "event" | "if";
      cron: string;
      timezone: string;
      enabled: boolean;
      concurrency_policy: "allow" | "forbid" | "replace";
      orchestration_mode: "tasks" | "plan";
      if_condition: string;
    };
    batch_sessions: [];
    runs: [];
    saved_at: string;
  };
}

function splitList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return "";
}

function toNodeKind(node: PipelineNodeDefinition): AgentMomoApiPayload["pipeline_document"]["nodes"][number]["kind"] {
  if (node.type === "sink.cache_log") {
    return "cache";
  }
  if (node.category === "source") {
    return "source";
  }
  if (node.category === "transform") {
    return "transform";
  }
  return "serve";
}

function toTransformationMode(node: PipelineNodeDefinition): AgentMomoApiPayload["pipeline_document"]["transformations"][number]["mode"] {
  if (node.type === "transform.sql") {
    return "sql";
  }
  if (node.type === "transform.python") {
    return "python";
  }
  return "custom";
}

export function buildPipelineIntentPrompt(item: NoodlePipelineIntentCatalogItem) {
  const sources = item.intent.sources.map((source) => `${source.name} (${source.kind})`).join(", ");
  const consumers = item.intent.targetConsumers.join(", ");
  return `${item.summary} Business goal: ${item.intent.businessGoal} Sources: ${sources}. Consumers: ${consumers}.`;
}

export function buildArchitectureContextPayload(draft: ArchitectContextDraft): AgentMomoApiPayload["architecture_context"] | undefined {
  const hasContent = Object.values(draft).some((value) => value.trim().length > 0);
  if (!hasContent) {
    return undefined;
  }

  return {
    name: draft.name.trim() || "Pipeline Architect Context",
    prompt: draft.prompt.trim(),
    summary: draft.summary.trim(),
    system_design: draft.systemDesign.trim(),
    selected_providers: splitList(draft.selectedProviders),
    assumptions: splitList(draft.assumptions),
    components: splitList(draft.components),
    cloud_services: splitList(draft.cloudServices),
    data_flow: splitList(draft.dataFlow),
    scaling_strategy: splitList(draft.scalingStrategy),
    security_considerations: splitList(draft.securityConsiderations)
  };
}

export function buildPipelineDocumentPayload(spec: PipelineSpec): AgentMomoApiPayload["pipeline_document"] {
  const connectionRefs = spec.nodes
    .map((node) => ({ node, connectionId: typeof node.config.connectionId === "string" ? node.config.connectionId.trim() : "" }))
    .filter((entry) => entry.connectionId.length > 0)
    .reduce<AgentMomoApiPayload["pipeline_document"]["connection_refs"]>((acc, entry) => {
      if (acc.some((existing) => existing.id === entry.connectionId)) {
        return acc;
      }
      acc.push({
        id: entry.connectionId,
        name: entry.connectionId,
        plugin: entry.node.type,
        environment: "custom",
        auth_ref: entry.connectionId,
        params: [],
        notes: `Referenced by ${entry.node.name}.`
      });
      return acc;
    }, []);

  return {
    id: spec.pipelineId,
    name: spec.name,
    status: "draft",
    version: spec.version,
    nodes: spec.nodes.map((node) => ({
      id: node.id,
      label: node.name,
      kind: toNodeKind(node),
      position: node.position,
      params: Object.entries(node.config).map(([key, value]) => ({ key, value: stringifyValue(value) }))
    })),
    edges: spec.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })),
    connection_refs: connectionRefs,
    metadata_assets: spec.nodes
      .filter((node) => node.category === "sink")
      .map((node) => ({
        id: `asset-${node.id}`,
        name: node.name,
        zone: node.type === "sink.cache_log" ? "control_plane" : "serving",
        owner: spec.metadata.owner,
        classification: "internal",
        tags: node.tags ?? []
      })),
    schemas: [],
    transformations: spec.nodes
      .filter((node) => node.category === "transform")
      .map((node) => ({
        id: `transformation-${node.id}`,
        node_id: node.id,
        name: node.name,
        plugin: node.type,
        mode: toTransformationMode(node),
        description: node.description,
        code: typeof node.config.sql === "string" ? node.config.sql : typeof node.config.entrypoint === "string" ? node.config.entrypoint : "",
        config_json: JSON.stringify(node.config),
        tags: node.tags ?? []
      })),
    deployment: {
      enabled: false,
      deploy_target: "local_docker",
      repository: {
        provider: "github",
        connection_id: null,
        repository: "",
        branch: "main",
        backend_path: "app",
        workflow_ref: ".github/workflows/deploy.yml"
      },
      build_command: "docker build -t noodle-pipeline-backend .",
      deploy_command: "docker compose up -d --build",
      artifact_name: "noodle-pipeline-backend",
      notes: ""
    },
    orchestrator_plan: null,
    schedule: {
      trigger: spec.schedule.mode === "cron" ? "schedule" : spec.schedule.mode === "event" ? "event" : "manual",
      cron: spec.schedule.cron ?? "",
      timezone: spec.schedule.timezone ?? "UTC",
      enabled: spec.schedule.mode !== "manual",
      concurrency_policy: "forbid",
      orchestration_mode: "tasks",
      if_condition: ""
    },
    batch_sessions: [],
    runs: [],
    saved_at: new Date().toISOString()
  };
}

export function buildDesignerMomoPayload(args: {
  userTurn: string;
  spec: PipelineSpec;
  architecture: ArchitectContextDraft;
  intent?: NoodlePipelineIntentCatalogItem;
  maxResults?: number;
}): AgentMomoApiPayload {
  const payload: AgentMomoApiPayload = {
    user_turn: args.userTurn,
    max_results: args.maxResults ?? 4,
    pipeline_document: buildPipelineDocumentPayload(args.spec)
  };

  const architectureContext = buildArchitectureContextPayload(args.architecture);
  if (architectureContext) {
    payload.architecture_context = architectureContext;
  }

  if (args.intent) {
    payload.intent = {
      name: args.intent.intent.name,
      business_goal: args.intent.intent.businessGoal,
      deployment_scope: args.intent.intent.deploymentScope,
      latency_slo: args.intent.intent.latencySlo,
      requires_ml_features: args.intent.intent.requiresMlFeatures,
      requires_realtime_serving: args.intent.intent.requiresRealtimeServing,
      contains_sensitive_data: args.intent.intent.containsSensitiveData,
      target_consumers: args.intent.intent.targetConsumers,
      sources: args.intent.intent.sources.map((source) => ({
        name: source.name,
        kind: source.kind,
        environment: source.environment,
        format_hint: source.formatHint,
        change_pattern: source.changePattern
      }))
    };
  }

  return payload;
}
