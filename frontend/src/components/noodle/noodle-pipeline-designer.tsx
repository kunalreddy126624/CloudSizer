"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import CloseFullscreenRoundedIcon from "@mui/icons-material/CloseFullscreenRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import ReactFlow, {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowProvider,
  type Connection,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeDragHandler,
  type NodeProps,
  type ReactFlowInstance
} from "reactflow";

import {
  loadNoodlePipelineDraft,
  loadSavedNoodlePipelines,
  mergeSavedNoodlePipelines,
  storeNoodlePipelineDraft,
  storeSavedNoodlePipelines,
  type SavedArchitectureDraft
} from "@/lib/scenario-store";
import {
  createNoodlePipelineRun,
  listNoodlePipelines,
  saveNoodlePipeline
} from "@/lib/api";
import type {
  NoodleArchitectureOverview,
  NoodleArchitecturePrinciple,
  NoodleDesignerConnectionRef,
  NoodleDesignerDocumentStatus,
  NoodleDesignerEdge,
  NoodleDesignerLogLevel,
  NoodleDesignerMetadataAsset,
  NoodleDesignerNode,
  NoodleDesignerNodeKind,
  NoodleOrchestratorPlan,
  NoodleOrchestratorTaskPlan,
  NoodleDesignerParam,
  NoodleDesignerRun,
  NoodleDesignerSchedule,
  NoodleDesignerSchema,
  NoodleDesignerTransformation,
  NoodleDesignerTransformationMode,
  NoodleDesignerValidation,
  NoodlePipelineDesignerDocument,
  NoodleSourceSystem
} from "@/lib/types";

interface NoodlePipelineDesignerProps {
  intentName: string;
  sources: NoodleSourceSystem[];
  workflowTemplate?: string | null;
  preferIntentSeed?: boolean;
  architectureOverview?: NoodleArchitectureOverview | null;
  designPrinciples?: NoodleArchitecturePrinciple[];
  savedArchitecture?: SavedArchitectureDraft | null;
  agentMomoBrief?: string | null;
  seedDocument?: NoodlePipelineDesignerDocument | null;
  plannedOrchestratorPlan?: NoodleOrchestratorPlan | null;
}

interface DesignerNodeData {
  id: string;
  label: string;
  kind: NoodleDesignerNodeKind;
  selected: boolean;
}

interface MomoMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
}

interface DesignerNotice {
  id: string;
  severity: "success" | "info" | "warning" | "error";
  message: string;
}

const NODE_LIBRARY: Array<{ kind: NoodleDesignerNodeKind; label: string; description: string }> = [
  { kind: "source", label: "Source", description: "Declare plugin-backed entry points and external connection refs." },
  { kind: "ingest", label: "Ingest", description: "Land data through durable control-plane and worker handoff." },
  { kind: "transform", label: "Transform", description: "Run plugin-based transforms and curated processing stages." },
  { kind: "quality", label: "Quality", description: "Enforce contracts, schema rules, tests, and observability gates." },
  { kind: "feature", label: "Feature", description: "Materialize reusable ML and agent-ready feature outputs." },
  { kind: "serve", label: "Serve", description: "Publish governed outputs to analytics, APIs, and downstream consumers." }
];

const NODE_COLORS: Record<NoodleDesignerNodeKind, { fill: string; stroke: string; accent: string }> = {
  source: { fill: "#eff6ff", stroke: "#2563eb", accent: "#1d4ed8" },
  ingest: { fill: "#ecfeff", stroke: "#0891b2", accent: "#0e7490" },
  transform: { fill: "#f5f3ff", stroke: "#7c3aed", accent: "#6d28d9" },
  quality: { fill: "#fff7ed", stroke: "#ea580c", accent: "#c2410c" },
  feature: { fill: "#f0fdf4", stroke: "#16a34a", accent: "#15803d" },
  serve: { fill: "#fdf2f8", stroke: "#db2777", accent: "#be185d" }
};

const DEFAULT_SCHEDULE: NoodleDesignerSchedule = {
  trigger: "manual",
  cron: "0 * * * *",
  timezone: "UTC",
  enabled: false,
  concurrency_policy: "forbid"
};

const CANVAS_HEIGHT = 720;
const RUN_TABS = ["builder", "runs"] as const;
const LOG_LEVELS: Array<NoodleDesignerLogLevel | "all"> = ["all", "log", "info", "warn"];
const PANEL_FOCUS = ["repository", "canvas", "momo"] as const;
const REPOSITORY_SECTIONS = ["palette", "connections", "metadata", "schemas", "transformations", "spec"] as const;
const noodleButtonBaseSx = {
  borderRadius: 999,
  px: 2,
  minHeight: 40,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  textTransform: "none"
};
const noodleButtonSecondarySx = {
  ...noodleButtonBaseSx,
  borderColor: "var(--line)",
  color: "var(--text)",
  bgcolor: "#fff",
  "&:hover": {
    borderColor: "#9db8d8",
    bgcolor: "#f8fbff"
  }
};
const noodleButtonPrimarySx = {
  ...noodleButtonBaseSx,
  bgcolor: "var(--accent)",
  color: "#fff",
  boxShadow: "0 10px 24px rgba(38, 93, 184, 0.18)",
  "&:hover": {
    bgcolor: "#265db8"
  }
};
const panelIconButtonSx = {
  width: 36,
  height: 36,
  border: "1px solid var(--line)",
  bgcolor: "#fff",
  color: "var(--text)",
  "&:hover": {
    borderColor: "#9db8d8",
    bgcolor: "#f8fbff"
  }
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.closest("[contenteditable='true']") !== null)
  );
}

function buildNodeLabel(kind: NoodleDesignerNodeKind, count: number) {
  return `${titleize(kind)} ${count}`;
}

function defaultParamsForKind(kind: NoodleDesignerNodeKind): NoodleDesignerParam[] {
  switch (kind) {
    case "source":
      return [
        { key: "plugin", value: "source-plugin" },
        { key: "connection_ref", value: "source-connection" }
      ];
    case "ingest":
      return [
        { key: "runner", value: "airflow-dag" },
        { key: "operator", value: "python" },
        { key: "target_zone", value: "bronze" }
      ];
    case "transform":
      return [
        { key: "plugin", value: "transform-plugin" },
        { key: "target_zone", value: "silver" }
      ];
    case "quality":
      return [
        { key: "checks", value: "schema, freshness, nulls" },
        { key: "lineage_required", value: "true" }
      ];
    case "feature":
      return [
        { key: "store", value: "feature_store" },
        { key: "materialization", value: "incremental" }
      ];
    case "serve":
      return [
        { key: "surface", value: "api" },
        { key: "artifact_sink", value: "serving" }
      ];
  }
}

function createDesignerNode(
  kind: NoodleDesignerNodeKind,
  position: { x: number; y: number },
  label?: string
): NoodleDesignerNode {
  return {
    id: createId(kind),
    kind,
    label: label ?? buildNodeLabel(kind, 1),
    position,
    params: defaultParamsForKind(kind)
  };
}

function createConnectionRefFromSource(source: NoodleSourceSystem): NoodleDesignerConnectionRef {
  return {
    id: createId("connection"),
    name: `${source.name}-connection`,
    plugin: `${source.kind}-plugin`,
    environment: source.environment,
    auth_ref: `${source.name}-secret`,
    notes: `${titleize(source.kind)} plugin for ${source.name}.`
  };
}

function createSchemaFromSource(source: NoodleSourceSystem, connectionId?: string): NoodleDesignerSchema {
  return {
    id: createId("schema"),
    name: `${source.name}_schema`,
    source_connection_id: connectionId ?? null,
    fields: [
      {
        id: createId("field"),
        name: "event_time",
        type: "timestamp",
        nullable: false,
        description: "Primary ingestion event timestamp."
      },
      {
        id: createId("field"),
        name: "payload",
        type: source.format_hint || "json",
        nullable: false,
        description: "Raw source payload."
      }
    ]
  };
}

function defaultTransformationCode(label: string, mode: NoodleDesignerTransformationMode) {
  if (mode === "sql" || mode === "spark_sql") {
    return [
      `-- ${label}`,
      "SELECT",
      "  *",
      "FROM source_table",
      "WHERE event_time >= CURRENT_DATE - INTERVAL '1 day';"
    ].join("\n");
  }

  if (mode === "dbt") {
    return [
      `-- ${label}`,
      "{{ config(materialized='incremental') }}",
      "",
      "select *",
      "from {{ ref('source_table') }}"
    ].join("\n");
  }

  return [
    `# ${label}`,
    "def transform(records: list[dict]) -> list[dict]:",
    "    return [record for record in records if record.get('event_time')]"
  ].join("\n");
}

function createTransformationForNode(node: NoodleDesignerNode, count: number): NoodleDesignerTransformation {
  const mode: NoodleDesignerTransformationMode = node.kind === "transform" ? "python" : "custom";
  return {
    id: createId("transformation"),
    node_id: node.id,
    name: `${node.label || "Transformation"} Step ${count}`,
    plugin: "transform-plugin",
    mode,
    description: `Portable ${mode} transformation for ${node.label}.`,
    code: defaultTransformationCode(node.label, mode),
    config_json: JSON.stringify(
      {
        entrypoint: mode === "python" ? "transform" : "main",
        output_zone: "silver",
        observability: {
          lineage: true,
          metrics: ["rows_in", "rows_out", "latency_ms"]
        }
      },
      null,
      2
    ),
    tags: ["transform"]
  };
}

function synchronizeTransformations(
  nodes: NoodleDesignerNode[],
  transformations: NoodleDesignerTransformation[]
) {
  const transformNodeMap = new Map(
    nodes.filter((node) => node.kind === "transform").map((node) => [node.id, node])
  );
  const normalized = transformations.map((transformation) => {
    if (!transformation.node_id) {
      return transformation;
    }

    if (!transformNodeMap.has(transformation.node_id)) {
      return {
        ...transformation,
        node_id: null
      };
    }

    return transformation;
  });

  const linkedNodeIds = new Set(
    normalized
      .map((transformation) => transformation.node_id)
      .filter((nodeId): nodeId is string => Boolean(nodeId))
  );

  const missing = nodes
    .filter((node) => node.kind === "transform" && !linkedNodeIds.has(node.id))
    .map((node, index) => createTransformationForNode(node, normalized.length + index + 1));

  return [...normalized, ...missing];
}

function defaultPluginForKind(kind: NoodleDesignerNodeKind) {
  switch (kind) {
    case "source":
      return "source-plugin";
    case "ingest":
      return "airflow-ingest";
    case "transform":
      return "transform-plugin";
    case "quality":
      return "quality-plugin";
    case "feature":
      return "feature-plugin";
    case "serve":
      return "serving-plugin";
  }
}

function defaultExecutionPlaneForKind(kind: NoodleDesignerNodeKind): NoodleOrchestratorTaskPlan["execution_plane"] {
  switch (kind) {
    case "source":
      return "control_plane";
    case "ingest":
      return "airflow";
    case "quality":
      return "quality";
    case "serve":
      return "serving";
    case "transform":
    case "feature":
      return "worker";
  }
}

function stageNameForKind(kind: NoodleDesignerNodeKind) {
  switch (kind) {
    case "source":
      return "source-contract";
    case "ingest":
      return "ingestion";
    case "transform":
      return "transformation";
    case "quality":
      return "quality-gate";
    case "feature":
      return "feature-materialization";
    case "serve":
      return "serving";
  }
}

function createTaskPlanForNode(node: NoodleDesignerNode): NoodleOrchestratorTaskPlan {
  return {
    id: createId("task-plan"),
    node_id: node.id,
    name: `${node.label} task`,
    stage: stageNameForKind(node.kind),
    plugin: defaultPluginForKind(node.kind),
    execution_plane: defaultExecutionPlaneForKind(node.kind),
    depends_on: [],
    outputs: [node.kind === "serve" ? "serving" : node.kind === "quality" ? "quality-report" : `${node.kind}-output`],
    notes: `Version and execute ${node.label} through the portable JSON spec.`
  };
}

function createOrchestratorPlan(
  documentName: string,
  trigger: NoodleDesignerSchedule["trigger"],
  workflowTemplate: string | null | undefined,
  nodes: NoodleDesignerNode[],
  plan?: NoodleOrchestratorPlan | null
): NoodleOrchestratorPlan {
  const nextPlan: NoodleOrchestratorPlan = plan
    ? {
        ...plan,
        tasks: plan.tasks.map((task) => ({
          ...task,
          depends_on: task.depends_on ?? [],
          outputs: task.outputs ?? []
        }))
      }
    : {
        id: createId("orchestrator-plan"),
        name: `${documentName} orchestrator plan`,
        objective: `Coordinate ${documentName} through a versioned control-plane plan.`,
        trigger,
        execution_target: workflowTemplate ?? "apache-airflow",
        tasks: [],
        notes: [
          "Keep scheduling, versioning, and metadata in the control plane.",
          "Hand the saved JSON pipeline spec to Apache Airflow for DAG execution.",
          "Treat logs, metrics, and lineage as part of the plan contract."
        ]
      };

  return synchronizeOrchestratorPlan(nodes, { ...nextPlan, trigger, execution_target: workflowTemplate ?? nextPlan.execution_target });
}

function synchronizeOrchestratorPlan(
  nodes: NoodleDesignerNode[],
  plan: NoodleOrchestratorPlan
): NoodleOrchestratorPlan {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const normalizedTasks = plan.tasks.map((task) => {
    if (!task.node_id) {
      return task;
    }

    const node = nodeMap.get(task.node_id);
    if (!node) {
      return {
        ...task,
        node_id: null,
        depends_on: task.depends_on.filter((dependency) => plan.tasks.some((entry) => entry.id === dependency))
      };
    }

    return {
      ...task,
      name: task.name || `${node.label} task`,
      stage: task.stage || stageNameForKind(node.kind),
      plugin: task.plugin || defaultPluginForKind(node.kind),
      execution_plane: task.execution_plane || defaultExecutionPlaneForKind(node.kind),
      outputs: task.outputs?.length ? task.outputs : [node.kind === "serve" ? "serving" : `${node.kind}-output`],
      depends_on: task.depends_on.filter((dependency) => plan.tasks.some((entry) => entry.id === dependency))
    };
  });

  const linkedNodeIds = new Set(
    normalizedTasks
      .map((task) => task.node_id)
      .filter((nodeId): nodeId is string => Boolean(nodeId))
  );
  const missingTasks = nodes
    .filter((node) => !linkedNodeIds.has(node.id))
    .map((node) => createTaskPlanForNode(node));

  return {
    ...plan,
    tasks: [...normalizedTasks, ...missingTasks]
  };
}

function createRunLogs(label: string, level: NoodleDesignerLogLevel, message: string, nodeId?: string | null) {
  return {
    id: createId("run-log"),
    timestamp: new Date().toISOString(),
    level,
    message: `${label}: ${message}`,
    node_id: nodeId ?? null
  };
}

function createSeedRuns(nodes: NoodleDesignerNode[]): NoodleDesignerRun[] {
  const now = Date.now();
  const sourceNode = nodes.find((node) => node.kind === "source") ?? nodes[0];
  const runningNode = nodes.find((node) => node.kind === "transform") ?? nodes[1] ?? nodes[0];

  return [
    {
      id: createId("run"),
      label: "Manual run",
      orchestrator: "Apache Airflow",
      status: "running",
      trigger: "manual",
      started_at: new Date(now - 1000 * 60 * 8).toISOString(),
      finished_at: null,
      task_runs: nodes.map((node, index) => ({
        id: createId("task-run"),
        node_id: node.id,
        node_label: node.label,
        state: node.id === runningNode?.id ? "running" : index < 2 ? "success" : "queued",
        started_at: index < 2 ? new Date(now - 1000 * 60 * (8 - index)).toISOString() : null,
        finished_at: index < 2 ? new Date(now - 1000 * 60 * (7 - index)).toISOString() : null
      })),
      logs: [
        createRunLogs("Manual run", "log", "Airflow DAG parsed from the JSON pipeline spec."),
        createRunLogs("Manual run", "info", "Scheduler accepted the run and queued upstream tasks."),
        createRunLogs("Manual run", "warn", "Quality gate is waiting on schema checks before downstream serving tasks can start.", runningNode?.id)
      ]
    },
    {
      id: createId("run"),
      label: "Scheduled hourly run",
      orchestrator: "Apache Airflow",
      status: "success",
      trigger: "schedule",
      started_at: new Date(now - 1000 * 60 * 90).toISOString(),
      finished_at: new Date(now - 1000 * 60 * 74).toISOString(),
      task_runs: nodes.map((node) => ({
        id: createId("task-run"),
        node_id: node.id,
        node_label: node.label,
        state: "success",
        started_at: new Date(now - 1000 * 60 * 88).toISOString(),
        finished_at: new Date(now - 1000 * 60 * 76).toISOString()
      })),
      logs: [
        createRunLogs("Scheduled hourly run", "log", "Airflow scheduler triggered the DAG from the cron definition."),
        createRunLogs("Scheduled hourly run", "info", `Source plugin ${sourceNode?.label ?? "source"} finished ingestion and emitted lineage.`),
        createRunLogs("Scheduled hourly run", "info", "Run completed successfully with artifacts and metrics persisted.")
      ]
    }
  ];
}

function buildSeedDocument(
  intentName: string,
  sources: NoodleSourceSystem[],
  workflowTemplate?: string | null,
  plannedOrchestratorPlan?: NoodleOrchestratorPlan | null
): NoodlePipelineDesignerDocument {
  const sourceNodes = sources.map((source, index) =>
    createDesignerNode("source", { x: 40, y: 70 + index * 130 }, source.name.replaceAll("_", " "))
  );
  const ingestNode = createDesignerNode("ingest", { x: 320, y: 130 }, "Landing ingest");
  const transformNode = createDesignerNode("transform", { x: 620, y: 130 }, "Curate transforms");
  const qualityNode = createDesignerNode("quality", { x: 920, y: 130 }, "Quality gate");
  const serveNode = createDesignerNode("serve", { x: 1220, y: 130 }, "Serve outputs");
  const connectionRefs = sources.map((source) => createConnectionRefFromSource(source));
  const transformations = [createTransformationForNode(transformNode, 1)];
  const nodes = [...sourceNodes, ingestNode, transformNode, qualityNode, serveNode];

  return {
    id: createId("pipeline"),
    name: intentName,
    status: "draft",
    version: 1,
    nodes,
    edges: [
      ...sourceNodes.map((node) => ({ id: createId("edge"), source: node.id, target: ingestNode.id })),
      { id: createId("edge"), source: ingestNode.id, target: transformNode.id },
      { id: createId("edge"), source: transformNode.id, target: qualityNode.id },
      { id: createId("edge"), source: qualityNode.id, target: serveNode.id }
    ],
    connection_refs: connectionRefs,
    metadata_assets: [
      {
        id: createId("metadata"),
        name: `${intentName}-bronze`,
        zone: "bronze",
        owner: "data-platform",
        classification: "internal",
        tags: ["raw", "ingestion"]
      },
      {
        id: createId("metadata"),
        name: `${intentName}-serving`,
        zone: "serving",
        owner: "analytics",
        classification: "governed",
        tags: ["serving", "published"]
      }
    ],
    schemas: sources.map((source, index) => createSchemaFromSource(source, connectionRefs[index]?.id)),
    transformations,
    orchestrator_plan: createOrchestratorPlan(intentName, DEFAULT_SCHEDULE.trigger, workflowTemplate, nodes, plannedOrchestratorPlan),
    schedule: DEFAULT_SCHEDULE,
    runs: createSeedRuns(nodes),
    saved_at: new Date().toISOString()
  };
}

function normalizeDocument(
  document: NoodlePipelineDesignerDocument | null,
  intentName: string,
  sources: NoodleSourceSystem[],
  workflowTemplate?: string | null,
  plannedOrchestratorPlan?: NoodleOrchestratorPlan | null
): NoodlePipelineDesignerDocument {
  const seed = buildSeedDocument(intentName, sources, workflowTemplate, plannedOrchestratorPlan);
  if (!document) {
    return seed;
  }

  return {
    ...seed,
    ...document,
    connection_refs: document.connection_refs ?? seed.connection_refs,
    metadata_assets: document.metadata_assets ?? seed.metadata_assets,
    schemas: document.schemas ?? seed.schemas,
    transformations: synchronizeTransformations(
      document.nodes ?? seed.nodes,
      document.transformations ?? seed.transformations
    ),
    orchestrator_plan: createOrchestratorPlan(
      document.name ?? seed.name,
      document.schedule?.trigger ?? seed.schedule.trigger,
      workflowTemplate,
      document.nodes ?? seed.nodes,
      document.orchestrator_plan ?? plannedOrchestratorPlan ?? seed.orchestrator_plan
    ),
    schedule: document.schedule ?? seed.schedule,
    runs: document.runs ?? seed.runs
  };
}

function validateDocument(document: NoodlePipelineDesignerDocument): NoodleDesignerValidation[] {
  const validations: NoodleDesignerValidation[] = [];
  const nodeIds = new Set(document.nodes.map((node) => node.id));
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const node of document.nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, 0);
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  }

  if (!document.nodes.length) {
    validations.push({ id: "empty-graph", level: "error", message: "Add at least one node to define the DAG." });
    return validations;
  }

  for (const edge of document.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      validations.push({ id: `broken-edge-${edge.id}`, level: "error", message: `Edge ${edge.id} points to a missing node.` });
      continue;
    }

    if (edge.source === edge.target) {
      validations.push({ id: `self-edge-${edge.id}`, level: "error", message: "A task cannot depend on itself." });
      continue;
    }

    adjacency.get(edge.source)?.push(edge.target);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  for (const node of document.nodes) {
    const hasIncoming = (incoming.get(node.id) ?? 0) > 0;
    const hasOutgoing = (outgoing.get(node.id) ?? 0) > 0;

    if (node.kind !== "source" && !hasIncoming) {
      validations.push({ id: `dependency-${node.id}`, level: "error", message: `${node.label} has no upstream dependency.` });
    }
    if (node.kind === "source" && hasIncoming) {
      validations.push({ id: `source-${node.id}`, level: "warning", message: `${node.label} is a source node but has an upstream edge.` });
    }
    if (!hasIncoming && !hasOutgoing) {
      validations.push({ id: `isolated-${node.id}`, level: "warning", message: `${node.label} is disconnected from the rest of the DAG.` });
    }
  }

  const queue = document.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  let visited = 0;
  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId) {
      continue;
    }
    visited += 1;
    for (const neighbor of adjacency.get(nodeId) ?? []) {
      const nextDegree = (indegree.get(neighbor) ?? 0) - 1;
      indegree.set(neighbor, nextDegree);
      if (nextDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (visited !== document.nodes.length) {
    validations.push({ id: "cycle", level: "error", message: "The pipeline contains a cycle. Only DAG execution is supported." });
  }

  if (!document.connection_refs.length) {
    validations.push({ id: "connections", level: "warning", message: "No repository connection references are stored yet." });
  }
  if (!document.schemas.length) {
    validations.push({ id: "schemas", level: "warning", message: "No repository schemas are stored yet." });
  }
  if (!document.transformations.length) {
    validations.push({ id: "transformations", level: "warning", message: "No reusable transformations are stored yet." });
  }
  if (!document.metadata_assets.length) {
    validations.push({ id: "metadata", level: "warning", message: "No metadata assets are stored yet." });
  }
  if (!document.orchestrator_plan.tasks.length) {
    validations.push({ id: "task-plan", level: "warning", message: "No orchestrator task plan is defined yet." });
  }
  if (document.schedule.trigger === "schedule" && !document.schedule.cron.trim()) {
    validations.push({ id: "schedule", level: "error", message: "Scheduled pipelines require a cron expression." });
  }

  const linkedTransformationNodeIds = new Set<string>();
  for (const transformation of document.transformations) {
    if (transformation.node_id) {
      const linkedNode = nodeById.get(transformation.node_id);
      if (!linkedNode) {
        validations.push({
          id: `transformation-node-${transformation.id}`,
          level: "warning",
          message: `${transformation.name} references a node that no longer exists.`
        });
      } else if (linkedNode.kind !== "transform") {
        validations.push({
          id: `transformation-kind-${transformation.id}`,
          level: "error",
          message: `${transformation.name} is linked to ${linkedNode.label}, but only transform nodes can own transformations.`
        });
      } else {
        linkedTransformationNodeIds.add(linkedNode.id);
      }
    }

    try {
      JSON.parse(transformation.config_json);
    } catch {
      validations.push({
        id: `transformation-json-${transformation.id}`,
        level: "error",
        message: `${transformation.name} has invalid config JSON.`
      });
    }
  }

  for (const node of document.nodes.filter((entry) => entry.kind === "transform")) {
    if (!linkedTransformationNodeIds.has(node.id)) {
      validations.push({
        id: `transformation-missing-${node.id}`,
        level: "warning",
        message: `${node.label} does not have a linked transformation record yet.`
      });
    }
  }

  return validations;
}

function buildMomoWelcome(
  overview?: NoodleArchitectureOverview | null,
  principles: NoodleArchitecturePrinciple[] = [],
  savedArchitecture?: SavedArchitectureDraft | null,
  agentMomoBrief?: string | null
) {
  const overviewText = overview?.objective ?? "Use the control-plane architecture to guide pipeline design decisions.";
  const principlesText = principles.length
    ? `Focus on ${principles.slice(0, 3).map((principle) => principle.title.toLowerCase()).join(", ")}.`
    : "Apply plugin contracts, versioning, and observability-first design.";
  const architectureText = savedArchitecture
    ? `Saved architecture "${savedArchitecture.name}" is loaded as the platform context.`
    : "No saved architecture draft was passed in, so use the platform blueprint as the default context.";
  return `${overviewText} ${principlesText} ${architectureText}${agentMomoBrief ? ` ${agentMomoBrief}` : ""}`;
}

function buildMomoReply(
  prompt: string,
  document: NoodlePipelineDesignerDocument,
  overview?: NoodleArchitectureOverview | null,
  principles: NoodleArchitecturePrinciple[] = [],
  validations: NoodleDesignerValidation[] = [],
  savedArchitecture?: SavedArchitectureDraft | null,
  agentMomoBrief?: string | null
) {
  const lowerPrompt = prompt.toLowerCase();
  const validationErrors = validations.filter((item) => item.level === "error");
  const sourceCount = document.nodes.filter((node) => node.kind === "source").length;
  const architecturePlan = savedArchitecture?.plan as Record<string, unknown> | undefined;
  const architectureSummary =
    typeof architecturePlan?.summary === "string"
      ? architecturePlan.summary
      : savedArchitecture
        ? `Use the saved architecture "${savedArchitecture.name}" as the system reference.`
        : "Use the platform blueprint as the system reference.";

  if (lowerPrompt.includes("schedule")) {
    return `Scheduler guidance: keep scheduling in the control plane, let Apache Airflow orchestrate the DAG, and version the schedule with the pipeline. Current trigger is ${document.schedule.trigger} with concurrency policy ${document.schedule.concurrency_policy}. ${architectureSummary}`;
  }
  if (lowerPrompt.includes("schema")) {
    return `Schema guidance: every source plugin should map to a stored schema entry and quality gate. This design currently stores ${document.schemas.length} schema definitions for ${sourceCount} source nodes. ${architectureSummary}`;
  }
  if (lowerPrompt.includes("connection")) {
    return `Connection guidance: treat each external system as a plugin-backed connection reference, not a special case in task code. The repository currently stores ${document.connection_refs.length} connection references. ${architectureSummary}`;
  }
  if (lowerPrompt.includes("metadata") || lowerPrompt.includes("lineage")) {
    return `Metadata guidance: persist repository metadata and emit lineage as first-class signals. Right now the repository stores ${document.metadata_assets.length} metadata assets, and you should keep quality and serving nodes wired so lineage remains clear. ${architectureSummary}`;
  }
  if (lowerPrompt.includes("retry") || lowerPrompt.includes("worker") || lowerPrompt.includes("execution")) {
    return `Execution-plane guidance: keep retries, worker dispatch, and task states out of the UI layer. Apache Airflow should orchestrate the DAG while workers own pending, queued, running, success, failed, retrying, skipped, and cancelled transitions. ${architectureSummary}`;
  }

  const principleSummary = principles.length
    ? principles.map((principle) => principle.title).join(", ")
    : "JSON specs, plugins, versioning, and observability";

  return `${overview?.objective ?? "Design against the Noodle architecture overview."} Apply ${principleSummary}. ${architectureSummary}${agentMomoBrief ? ` ${agentMomoBrief}` : ""} Your graph currently has ${document.nodes.length} nodes and ${document.edges.length} edges.${validationErrors.length ? ` Resolve these blocking issues first: ${validationErrors.map((item) => item.message).join(" | ")}` : " The current graph is publishable from a dependency perspective."}`;
}

const DesignerNodeCard = ({ data }: NodeProps<DesignerNodeData>) => {
  const colors = NODE_COLORS[data.kind];

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        data-testid="node-target-handle"
        style={{ background: colors.stroke, border: "2px solid #ffffff", width: 10, height: 10, left: -6 }}
      />
      <Box
        data-testid={`designer-node-${data.id}`}
        sx={{
          width: 210,
          minHeight: 88,
          borderRadius: 3,
          border: data.selected ? `3px solid ${colors.accent}` : `2px solid ${colors.stroke}`,
          bgcolor: colors.fill,
          px: 2,
          py: 1.4,
          boxShadow: data.selected ? "0 16px 32px rgba(15, 23, 42, 0.12)" : "0 8px 18px rgba(15, 23, 42, 0.06)"
        }}
      >
        <Typography sx={{ fontWeight: 700, color: colors.accent, lineHeight: 1.1 }}>
          {data.label}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.75, color: "#475569" }}>
          {titleize(data.kind)}
        </Typography>
      </Box>
      <Handle
        type="source"
        position={Position.Right}
        data-testid="node-source-handle"
        style={{ background: colors.stroke, border: "2px solid #ffffff", width: 10, height: 10, right: -6 }}
      />
    </>
  );
};

const nodeTypes = { designer: DesignerNodeCard };

function NoodlePipelineDesignerInner({
  intentName,
  sources,
  workflowTemplate,
  preferIntentSeed = false,
  architectureOverview,
  designPrinciples = [],
  savedArchitecture,
  agentMomoBrief,
  seedDocument,
  plannedOrchestratorPlan
}: NoodlePipelineDesignerProps) {
  const [document, setDocument] = useState<NoodlePipelineDesignerDocument>(() =>
    seedDocument
      ? normalizeDocument(seedDocument, intentName, sources, workflowTemplate, plannedOrchestratorPlan)
      : buildSeedDocument(intentName, sources, workflowTemplate, plannedOrchestratorPlan)
  );
  const [savedDocuments, setSavedDocuments] = useState<NoodlePipelineDesignerDocument[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedMetadataId, setSelectedMetadataId] = useState<string | null>(null);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [selectedTransformationId, setSelectedTransformationId] = useState<string | null>(null);
  const [selectedTaskPlanId, setSelectedTaskPlanId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof RUN_TABS)[number]>("builder");
  const [repositorySection, setRepositorySection] = useState<(typeof REPOSITORY_SECTIONS)[number]>("palette");
  const [logFilter, setLogFilter] = useState<NoodleDesignerLogLevel | "all">("all");
  const [momoPrompt, setMomoPrompt] = useState("");
  const [rawSpecText, setRawSpecText] = useState("");
  const [rawSpecDirty, setRawSpecDirty] = useState(false);
  const [rawSpecError, setRawSpecError] = useState<string | null>(null);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [canvasCollapsed, setCanvasCollapsed] = useState(false);
  const [repositoryCollapsed, setRepositoryCollapsed] = useState(false);
  const [momoCollapsed, setMomoCollapsed] = useState(false);
  const [panelFocus, setPanelFocus] = useState<(typeof PANEL_FOCUS)[number] | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notice, setNotice] = useState<DesignerNotice | null>(null);
  const [momoMessages, setMomoMessages] = useState<MomoMessage[]>([
    {
      id: createId("momo"),
      role: "assistant",
      content: buildMomoWelcome(architectureOverview, designPrinciples, savedArchitecture, agentMomoBrief)
    }
  ]);

  useEffect(() => {
    const draft = loadNoodlePipelineDraft();
    const history = loadSavedNoodlePipelines().map((entry) =>
      normalizeDocument(entry, intentName, sources, workflowTemplate, plannedOrchestratorPlan)
    );
    setSavedDocuments(history);
    if (seedDocument) {
      setDocument(normalizeDocument(seedDocument, intentName, sources, workflowTemplate, plannedOrchestratorPlan));
    } else if (!preferIntentSeed && draft) {
      setDocument(normalizeDocument(draft, intentName, sources, workflowTemplate, plannedOrchestratorPlan));
    } else {
      setDocument(buildSeedDocument(intentName, sources, workflowTemplate, plannedOrchestratorPlan));
    }
    setHydrated(true);
  }, [intentName, plannedOrchestratorPlan, preferIntentSeed, seedDocument, sources, workflowTemplate]);

  useEffect(() => {
    let active = true;

    async function hydrateRemote() {
      try {
        const remoteDocuments = (await listNoodlePipelines()).map((entry) =>
          normalizeDocument(entry, intentName, sources, workflowTemplate, plannedOrchestratorPlan)
        );
        if (!active || !remoteDocuments.length) {
          return;
        }

        setSavedDocuments(remoteDocuments);
        storeSavedNoodlePipelines(remoteDocuments);

        if (!preferIntentSeed && !seedDocument) {
          const matchingRemote =
            remoteDocuments.find((entry) => entry.id === document.id) ??
            remoteDocuments.find((entry) => entry.name === intentName);

          if (matchingRemote) {
            setDocument(matchingRemote);
          }
        }

        setSyncError(null);
      } catch (error) {
        if (!active) {
          return;
        }
        setSyncError(error instanceof Error ? error.message : "Pipeline persistence is unavailable; using local draft storage.");
      }
    }

    void hydrateRemote();

    return () => {
      active = false;
    };
  }, [document.id, intentName, plannedOrchestratorPlan, preferIntentSeed, seedDocument, sources, workflowTemplate]);

  useEffect(() => {
    setMomoMessages([
      {
        id: createId("momo"),
        role: "assistant",
        content: buildMomoWelcome(architectureOverview, designPrinciples, savedArchitecture, agentMomoBrief)
      }
    ]);
  }, [agentMomoBrief, architectureOverview, designPrinciples, savedArchitecture]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    storeNoodlePipelineDraft({
      ...document,
      saved_at: new Date().toISOString()
    });
  }, [document, hydrated]);

  useEffect(() => {
    if (rawSpecDirty) {
      return;
    }

    setRawSpecText(JSON.stringify(document, null, 2));
  }, [document, rawSpecDirty]);

  const validations = useMemo(() => validateDocument(document), [document]);
  const validationErrors = validations.filter((item) => item.level === "error");
  const selectedNode = useMemo(() => document.nodes.find((node) => node.id === selectedNodeId) ?? null, [document.nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => document.edges.find((edge) => edge.id === selectedEdgeId) ?? null, [document.edges, selectedEdgeId]);
  const selectedConnection = useMemo(() => document.connection_refs.find((item) => item.id === selectedConnectionId) ?? null, [document.connection_refs, selectedConnectionId]);
  const selectedMetadata = useMemo(() => document.metadata_assets.find((item) => item.id === selectedMetadataId) ?? null, [document.metadata_assets, selectedMetadataId]);
  const selectedSchema = useMemo(() => document.schemas.find((item) => item.id === selectedSchemaId) ?? null, [document.schemas, selectedSchemaId]);
  const selectedTransformation = useMemo(() => document.transformations.find((item) => item.id === selectedTransformationId) ?? null, [document.transformations, selectedTransformationId]);
  const selectedNodeTransformation = useMemo(
    () => (selectedNode ? document.transformations.find((item) => item.node_id === selectedNode.id) ?? null : null),
    [document.transformations, selectedNode]
  );
  const selectedTaskPlan = useMemo(
    () => document.orchestrator_plan.tasks.find((task) => task.id === selectedTaskPlanId) ?? null,
    [document.orchestrator_plan.tasks, selectedTaskPlanId]
  );
  const selectedRun = useMemo(() => document.runs.find((run) => run.id === selectedRunId) ?? null, [document.runs, selectedRunId]);

  const flowNodes = useMemo<FlowNode<DesignerNodeData>[]>(
    () =>
      document.nodes.map((node) => ({
        id: node.id,
        type: "designer",
        position: node.position,
        draggable: true,
        data: { id: node.id, label: node.label, kind: node.kind, selected: node.id === selectedNodeId }
      })),
    [document.nodes, selectedNodeId]
  );

  const flowEdges = useMemo<FlowEdge[]>(
    () =>
      document.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        selected: edge.id === selectedEdgeId,
        markerEnd: { type: MarkerType.ArrowClosed, color: edge.id === selectedEdgeId ? "#0f172a" : "#316fd6" },
        style: { stroke: edge.id === selectedEdgeId ? "#0f172a" : "#316fd6", strokeWidth: edge.id === selectedEdgeId ? 3.5 : 2.5 }
      })),
    [document.edges, selectedEdgeId]
  );

  const nextVersion = useMemo(
    () =>
      savedDocuments.filter((entry) => entry.name === document.name).reduce((highest, entry) => Math.max(highest, entry.version), 0) + 1,
    [document.name, savedDocuments]
  );
  const canvasHeight = canvasExpanded ? "calc(100vh - 290px)" : CANVAS_HEIGHT;

  const updateDocument = useCallback((updater: (current: NoodlePipelineDesignerDocument) => NoodlePipelineDesignerDocument) => {
    setDocument((current) =>
      normalizeDocument(updater(current), intentName, sources, workflowTemplate, plannedOrchestratorPlan)
    );
  }, [intentName, plannedOrchestratorPlan, sources, workflowTemplate]);

  const insertNode = useCallback((kind: NoodleDesignerNodeKind, position?: { x: number; y: number }) => {
    updateDocument((current) => {
      const count = current.nodes.filter((node) => node.kind === kind).length + 1;
      return {
        ...current,
        nodes: [
          ...current.nodes,
          createDesignerNode(
            kind,
            position ?? { x: 160 + current.nodes.length * 32, y: 220 + (current.nodes.length % 4) * 110 },
            buildNodeLabel(kind, count)
          )
        ]
      };
    });
  }, [updateDocument]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return;
    }
    const source = connection.source;
    const target = connection.target;

    updateDocument((current) => {
      if (current.edges.some((edge) => edge.source === source && edge.target === target)) {
        return current;
      }
      return {
        ...current,
        edges: [...current.edges, { id: createId("edge"), source, target }]
      };
    });
  }, [updateDocument]);

  const handleNodeDragStop = useCallback<NodeDragHandler>((_, node) => {
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((entry) =>
        entry.id === node.id ? { ...entry, position: { x: node.position.x, y: node.position.y } } : entry
      )
    }));
  }, [updateDocument]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/noodle-node-kind") as NoodleDesignerNodeKind;
    if (!kind || !flowInstance) {
      return;
    }

    insertNode(kind, flowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }, [flowInstance, insertNode]);

  const handleSaveVersion = useCallback(async (status: NoodleDesignerDocumentStatus) => {
    const snapshot: NoodlePipelineDesignerDocument = {
      ...document,
      id: createId("pipeline-version"),
      version: nextVersion,
      status,
      saved_at: new Date().toISOString()
    };

    setRemoteBusy(true);
    try {
      const persisted = normalizeDocument(
        await saveNoodlePipeline(snapshot),
        intentName,
        sources,
        workflowTemplate,
        plannedOrchestratorPlan
      );
      const nextDocuments = mergeSavedNoodlePipelines(savedDocuments, persisted);
      setSavedDocuments(nextDocuments);
      storeSavedNoodlePipelines(nextDocuments);
      setDocument(persisted);
      setSyncError(null);
      setNotice({
        id: createId("notice"),
        severity: "success",
        message:
          status === "published"
            ? `Published v${persisted.version} to Saved Work.`
            : `Saved draft v${persisted.version} to Saved Work.`
      });
    } catch (error) {
      const nextDocuments = mergeSavedNoodlePipelines(savedDocuments, snapshot);
      setSavedDocuments(nextDocuments);
      storeSavedNoodlePipelines(nextDocuments);
      setDocument(snapshot);
      setSyncError(
        error instanceof Error
          ? `${error.message} Saved locally only.`
          : "Pipeline persistence is unavailable; saved locally only."
      );
      setNotice({
        id: createId("notice"),
        severity: "warning",
        message:
          status === "published"
            ? `Published version stored locally only because backend persistence was unavailable.`
            : `Draft saved locally only because backend persistence was unavailable.`
      });
    } finally {
      setRemoteBusy(false);
    }
  }, [document, intentName, nextVersion, plannedOrchestratorPlan, savedDocuments, sources, workflowTemplate]);

  const updateSelectedNode = useCallback((updater: (node: NoodleDesignerNode) => NoodleDesignerNode) => {
    if (!selectedNodeId) {
      return;
    }
    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === selectedNodeId ? updater(node) : node))
    }));
  }, [selectedNodeId, updateDocument]);

  const updateSelectedConnection = useCallback((updater: (item: NoodleDesignerConnectionRef) => NoodleDesignerConnectionRef) => {
    if (!selectedConnectionId) {
      return;
    }
    updateDocument((current) => ({
      ...current,
      connection_refs: current.connection_refs.map((item) => (item.id === selectedConnectionId ? updater(item) : item))
    }));
  }, [selectedConnectionId, updateDocument]);

  const updateSelectedMetadata = useCallback((updater: (item: NoodleDesignerMetadataAsset) => NoodleDesignerMetadataAsset) => {
    if (!selectedMetadataId) {
      return;
    }
    updateDocument((current) => ({
      ...current,
      metadata_assets: current.metadata_assets.map((item) => (item.id === selectedMetadataId ? updater(item) : item))
    }));
  }, [selectedMetadataId, updateDocument]);

  const updateSelectedSchema = useCallback((updater: (item: NoodleDesignerSchema) => NoodleDesignerSchema) => {
    if (!selectedSchemaId) {
      return;
    }
    updateDocument((current) => ({
      ...current,
      schemas: current.schemas.map((item) => (item.id === selectedSchemaId ? updater(item) : item))
    }));
  }, [selectedSchemaId, updateDocument]);

  const updateSelectedTransformation = useCallback((updater: (item: NoodleDesignerTransformation) => NoodleDesignerTransformation) => {
    if (!selectedTransformationId) {
      return;
    }
    updateDocument((current) => ({
      ...current,
      transformations: current.transformations.map((item) => (item.id === selectedTransformationId ? updater(item) : item))
    }));
  }, [selectedTransformationId, updateDocument]);

  const updateSelectedTaskPlan = useCallback((updater: (item: NoodleOrchestratorTaskPlan) => NoodleOrchestratorTaskPlan) => {
    if (!selectedTaskPlanId) {
      return;
    }
    updateDocument((current) => ({
      ...current,
      orchestrator_plan: {
        ...current.orchestrator_plan,
        tasks: current.orchestrator_plan.tasks.map((item) => (item.id === selectedTaskPlanId ? updater(item) : item))
      }
    }));
  }, [selectedTaskPlanId, updateDocument]);

  const renameNode = useCallback((nodeId: string) => {
    const node = document.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      return;
    }

    const nextLabel = window.prompt("Rename node", node.label);
    if (nextLabel === null) {
      return;
    }

    const trimmed = nextLabel.trim();
    if (!trimmed) {
      return;
    }

    updateDocument((current) => ({
      ...current,
      nodes: current.nodes.map((entry) => (entry.id === nodeId ? { ...entry, label: trimmed } : entry))
    }));
    setSelectedNodeId(nodeId);
  }, [document.nodes, updateDocument]);

  const applyRawSpec = useCallback(() => {
    try {
      const parsed = JSON.parse(rawSpecText) as NoodlePipelineDesignerDocument;
      const normalized = normalizeDocument(parsed, intentName, sources, workflowTemplate, plannedOrchestratorPlan);
      setDocument(normalized);
      setRawSpecText(JSON.stringify(normalized, null, 2));
      setRawSpecDirty(false);
      setRawSpecError(null);
      setSyncError(null);
    } catch (error) {
      setRawSpecError(error instanceof Error ? error.message : "Invalid JSON pipeline spec.");
    }
  }, [intentName, plannedOrchestratorPlan, rawSpecText, sources, workflowTemplate]);

  const resetRawSpec = useCallback(() => {
    setRawSpecText(JSON.stringify(document, null, 2));
    setRawSpecDirty(false);
    setRawSpecError(null);
  }, [document]);

  const deleteSelection = useCallback(() => {
    if (selectedNodeId) {
      updateDocument((current) => ({
        ...current,
        nodes: current.nodes.filter((node) => node.id !== selectedNodeId),
        edges: current.edges.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId)
      }));
      setSelectedNodeId(null);
      return;
    }

    if (selectedEdgeId) {
      updateDocument((current) => ({
        ...current,
        edges: current.edges.filter((edge) => edge.id !== selectedEdgeId)
      }));
      setSelectedEdgeId(null);
    }
  }, [selectedEdgeId, selectedNodeId, updateDocument]);

  useEffect(() => {
    if (!document.connection_refs.length) {
      if (selectedConnectionId !== null) {
        setSelectedConnectionId(null);
      }
      return;
    }
    if (!selectedConnectionId || !document.connection_refs.some((item) => item.id === selectedConnectionId)) {
      setSelectedConnectionId(document.connection_refs[0].id);
    }
  }, [document.connection_refs, selectedConnectionId]);

  useEffect(() => {
    if (!document.metadata_assets.length) {
      if (selectedMetadataId !== null) {
        setSelectedMetadataId(null);
      }
      return;
    }
    if (!selectedMetadataId || !document.metadata_assets.some((item) => item.id === selectedMetadataId)) {
      setSelectedMetadataId(document.metadata_assets[0].id);
    }
  }, [document.metadata_assets, selectedMetadataId]);

  useEffect(() => {
    if (!document.schemas.length) {
      if (selectedSchemaId !== null) {
        setSelectedSchemaId(null);
      }
      return;
    }
    if (!selectedSchemaId || !document.schemas.some((item) => item.id === selectedSchemaId)) {
      setSelectedSchemaId(document.schemas[0].id);
    }
  }, [document.schemas, selectedSchemaId]);

  useEffect(() => {
    if (!document.transformations.length) {
      if (selectedTransformationId !== null) {
        setSelectedTransformationId(null);
      }
      return;
    }
    if (!selectedTransformationId || !document.transformations.some((item) => item.id === selectedTransformationId)) {
      setSelectedTransformationId(document.transformations[0].id);
    }
  }, [document.transformations, selectedTransformationId]);

  useEffect(() => {
    if (!document.orchestrator_plan.tasks.length) {
      if (selectedTaskPlanId !== null) {
        setSelectedTaskPlanId(null);
      }
      return;
    }
    if (!selectedTaskPlanId || !document.orchestrator_plan.tasks.some((item) => item.id === selectedTaskPlanId)) {
      setSelectedTaskPlanId(document.orchestrator_plan.tasks[0].id);
    }
  }, [document.orchestrator_plan.tasks, selectedTaskPlanId]);

  useEffect(() => {
    if (!document.runs.length) {
      if (selectedRunId !== null) {
        setSelectedRunId(null);
      }
      return;
    }
    if (!selectedRunId || !document.runs.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(document.runs[0].id);
    }
  }, [document.runs, selectedRunId]);

  useEffect(() => {
    if (selectedNodeId && !document.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [document.nodes, selectedNodeId]);

  useEffect(() => {
    if (selectedEdgeId && !document.edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [document.edges, selectedEdgeId]);

  useEffect(() => {
    if (!selectedNode || selectedNode.kind !== "transform") {
      return;
    }

    const linkedTransformation = document.transformations.find((item) => item.node_id === selectedNode.id);
    if (linkedTransformation && linkedTransformation.id !== selectedTransformationId) {
      setSelectedTransformationId(linkedTransformation.id);
    }
  }, [document.transformations, selectedNode, selectedTransformationId]);

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && (selectedNodeId || selectedEdgeId)) {
        event.preventDefault();
        deleteSelection();
        return;
      }

      if ((event.key === "F2" || event.key === "Enter") && selectedNodeId) {
        event.preventDefault();
        renameNode(selectedNodeId);
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [deleteSelection, renameNode, selectedEdgeId, selectedNodeId]);

  const sendMomoMessage = useCallback(() => {
    if (!momoPrompt.trim()) {
      return;
    }
    const userMessage: MomoMessage = { id: createId("momo"), role: "user", content: momoPrompt.trim() };
    const reply: MomoMessage = {
      id: createId("momo"),
      role: "assistant",
      content: buildMomoReply(
        momoPrompt,
        document,
        architectureOverview,
        designPrinciples,
        validations,
        savedArchitecture,
        agentMomoBrief
      )
    };
    setMomoMessages((current) => [...current, userMessage, reply]);
    setMomoPrompt("");
  }, [agentMomoBrief, architectureOverview, designPrinciples, document, momoPrompt, savedArchitecture, validations]);

  const triggerRun = useCallback(async () => {
    const now = new Date().toISOString();
    const hasBlockingErrors = validationErrors.length > 0;
    setRemoteBusy(true);
    try {
      const response = await createNoodlePipelineRun(document.id, {
        trigger: "manual",
        document
      });
      const persisted = normalizeDocument(response.pipeline, intentName, sources, workflowTemplate, plannedOrchestratorPlan);
      setDocument(persisted);
      setSavedDocuments((current) => {
        const nextDocuments = mergeSavedNoodlePipelines(current, persisted);
        storeSavedNoodlePipelines(nextDocuments);
        return nextDocuments;
      });
      setSelectedRunId(response.run.id);
      setActiveTab("runs");
      setSyncError(null);
      setNotice({
        id: createId("notice"),
        severity: response.run.status === "failed" ? "warning" : "success",
        message: `${response.run.label} is ${titleize(response.run.status)}.`
      });
      return;
    } catch (error) {
      const nextRun: NoodleDesignerRun = {
        id: createId("run"),
        label: hasBlockingErrors ? "Manual debug run" : "Manual Airflow run",
        orchestrator: "Apache Airflow",
        status: hasBlockingErrors ? "failed" : "running",
        trigger: "manual",
        started_at: now,
        finished_at: hasBlockingErrors ? now : null,
        task_runs: document.nodes.map((node, index) => ({
          id: createId("task-run"),
          node_id: node.id,
          node_label: node.label,
          state: hasBlockingErrors ? (index === 0 ? "failed" : "skipped") : index === 0 ? "running" : "queued",
          started_at: index === 0 ? now : null,
          finished_at: hasBlockingErrors && index === 0 ? now : null
        })),
        logs: [
          createRunLogs("Manual Airflow run", "log", "Airflow DAG was generated from the saved JSON pipeline document."),
          createRunLogs("Manual Airflow run", "info", `Run started for pipeline version ${document.version}.`),
          hasBlockingErrors
            ? createRunLogs("Manual Airflow run", "warn", `Run blocked by validation issues: ${validationErrors.map((item) => item.message).join(" | ")}`)
            : createRunLogs("Manual Airflow run", "warn", "Downstream tasks are waiting for upstream dependencies and repository contracts to complete.")
        ]
      };

      updateDocument((current) => ({
        ...current,
        runs: [nextRun, ...current.runs]
      }));
      setSelectedRunId(nextRun.id);
      setActiveTab("runs");
      setSyncError(
        error instanceof Error
          ? `${error.message} Run was simulated locally only.`
          : "Run service unavailable; execution was simulated locally only."
      );
      setNotice({
        id: createId("notice"),
        severity: hasBlockingErrors ? "warning" : "info",
        message: hasBlockingErrors
          ? "Run was blocked by validation issues and simulated locally."
          : "Run service was unavailable, so execution was simulated locally."
      });
    } finally {
      setRemoteBusy(false);
    }
  }, [document, intentName, plannedOrchestratorPlan, sources, updateDocument, validationErrors, workflowTemplate]);

  const filteredLogs = useMemo(
    () => selectedRun?.logs.filter((entry) => (logFilter === "all" ? true : entry.level === logFilter)) ?? [],
    [logFilter, selectedRun]
  );

  const latestPublished = savedDocuments.find((entry) => entry.status === "published" && entry.name === document.name) ?? null;
  const publishReadinessLabel = validationErrors.length
    ? `${validationErrors.length} blocking issue${validationErrors.length === 1 ? "" : "s"}`
    : "Ready to publish";
  const repositoryCoverage = document.connection_refs.length + document.metadata_assets.length + document.schemas.length + document.transformations.length;
  const graphDensityLabel = `${document.nodes.length} nodes / ${document.edges.length} edges`;
  const latestRunNotifications: Array<{ id: string; message: string; severity: "success" | "info" | "warning" }> = document.runs.slice(0, 4).map((run) => ({
    id: run.id,
    message: `${run.label} ${titleize(run.status)} at ${new Date(run.started_at).toLocaleTimeString()}.`,
    severity: run.status === "failed" ? "warning" : run.status === "success" ? "success" : "info"
  }));
  const repositoryVisible = panelFocus === null || panelFocus === "repository";
  const centerVisible = panelFocus === null || panelFocus === "canvas";
  const momoVisible = panelFocus === null || panelFocus === "momo";
  const centerLg = panelFocus === "canvas" ? 12 : canvasExpanded ? 8 : 6;
  const sideLg = panelFocus === "repository" || panelFocus === "momo" ? 12 : canvasExpanded ? 2 : 3;

  return (
    <Stack
      spacing={2.5}
      sx={{
        minHeight: { xs: "auto", lg: "calc(100vh - 180px)" },
        "& .MuiButton-root": noodleButtonBaseSx
      }}
    >
      <Card
        sx={{
          borderRadius: 5,
          border: "1px solid #d8e3f0",
          boxShadow: "none",
          overflow: "hidden",
          background:
            "radial-gradient(circle at top left, rgba(49, 111, 214, 0.14), transparent 28%), radial-gradient(circle at top right, rgba(14, 116, 144, 0.14), transparent 26%), linear-gradient(180deg, #fdfefe 0%, #f6faff 100%)"
        }}
      >
        <CardContent sx={{ p: { xs: 2.25, md: 2.75 } }}>
          <Stack spacing={2.25}>
            <Stack direction={{ xs: "column", xl: "row" }} justifyContent="space-between" spacing={2}>
              <Stack spacing={1}>
                <Typography variant="overline" sx={{ color: "var(--accent)", letterSpacing: "0.14em", fontWeight: 800 }}>
                  Noodle Design Studio
                </Typography>
                <Typography variant="h4" sx={{ letterSpacing: "-0.03em" }}>
                  {document.name}
                </Typography>
                <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 960 }}>
                  Build the working pipeline spec, wire repository contracts, and move from draft to publishable DAG execution without leaving the designer.
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip label={publishReadinessLabel} color={validationErrors.length ? "warning" : "success"} sx={{ borderRadius: 999, fontWeight: 700 }} />
                  <Chip label={document.status === "published" ? "Published workspace" : "Working draft"} sx={{ borderRadius: 999, bgcolor: document.status === "published" ? "#e8fff1" : "#eef6ff", fontWeight: 700 }} />
                  {latestPublished ? <Chip label={`Latest release v${latestPublished.version}`} variant="outlined" sx={{ borderRadius: 999, fontWeight: 700 }} /> : null}
                  {workflowTemplate ? <Chip label={workflowTemplate.replaceAll("-", " ")} sx={{ borderRadius: 999, bgcolor: "#f1f5f9", fontWeight: 700, textTransform: "capitalize" }} /> : null}
                </Stack>
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  variant="outlined"
                  onClick={() => setDocument(buildSeedDocument(intentName, sources, workflowTemplate, plannedOrchestratorPlan))}
                  sx={noodleButtonSecondarySx}
                  disabled={remoteBusy}
                >
                  Reset Seed
                </Button>
                <Button variant="outlined" onClick={() => void handleSaveVersion("draft")} sx={noodleButtonSecondarySx} disabled={remoteBusy}>
                  {remoteBusy ? "Saving..." : "Save Draft"}
                </Button>
                <Button variant="outlined" onClick={() => void triggerRun()} sx={noodleButtonSecondarySx} disabled={remoteBusy}>
                  {remoteBusy ? "Working..." : "Run Pipeline"}
                </Button>
                <Button variant="contained" disabled={validationErrors.length > 0 || remoteBusy} onClick={() => void handleSaveVersion("published")} sx={noodleButtonPrimarySx}>
                  Publish Release
                </Button>
              </Stack>
            </Stack>

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6} xl={3}>
                <Box sx={{ p: 1.6, borderRadius: 3.5, bgcolor: "rgba(255,255,255,0.82)", border: "1px solid #dde8f5" }}>
                  <Typography variant="caption" sx={{ color: "var(--muted)", fontWeight: 800, letterSpacing: "0.08em" }}>
                    GRAPH
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.35 }}>
                    {graphDensityLabel}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                    Interactive DAG canvas with editable node contracts.
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} xl={3}>
                <Box sx={{ p: 1.6, borderRadius: 3.5, bgcolor: "rgba(255,255,255,0.82)", border: "1px solid #dde8f5" }}>
                  <Typography variant="caption" sx={{ color: "var(--muted)", fontWeight: 800, letterSpacing: "0.08em" }}>
                    REPOSITORY
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.35 }}>
                    {repositoryCoverage} contracts
                  </Typography>
                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                    Connections, metadata, schemas, and transformations travel with the spec.
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} xl={3}>
                <Box sx={{ p: 1.6, borderRadius: 3.5, bgcolor: "rgba(255,255,255,0.82)", border: "1px solid #dde8f5" }}>
                  <Typography variant="caption" sx={{ color: "var(--muted)", fontWeight: 800, letterSpacing: "0.08em" }}>
                    RELEASE
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.35 }}>
                    v{document.version}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                    {latestPublished ? `Last published version is v${latestPublished.version}.` : "No published release yet."}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} xl={3}>
                <Box sx={{ p: 1.6, borderRadius: 3.5, bgcolor: "rgba(255,255,255,0.82)", border: "1px solid #dde8f5" }}>
                  <Typography variant="caption" sx={{ color: "var(--muted)", fontWeight: 800, letterSpacing: "0.08em" }}>
                    RUNS
                  </Typography>
                  <Typography variant="h6" sx={{ mt: 0.35 }}>
                    {document.runs.length} history entries
                  </Typography>
                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                    {selectedRun ? `Latest run is ${titleize(selectedRun.status)}.` : "No run selected yet."}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Stack>
        </CardContent>
      </Card>

      {validationErrors.length ? (
        <Alert severity="warning">
          Resolve the blocking dependency issues before publishing. Agent Momo can help interpret the current graph.
        </Alert>
      ) : null}

      {syncError ? <Alert severity="info">{syncError}</Alert> : null}

      <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "#f8fbff" }}>
        <CardContent sx={{ p: { xs: 1.25, md: 1.5 } }}>
          <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5} alignItems={{ xs: "flex-start", md: "center" }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Workspace Mode</Typography>
              <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                Switch between authoring the DAG and reviewing live-style run execution.
              </Typography>
            </Box>
            <Tabs
              value={activeTab}
              onChange={(_, value) => setActiveTab(value)}
              sx={{
                minHeight: 0,
                p: 0.5,
                borderRadius: 999,
                bgcolor: "#e7f0fa",
                "& .MuiTabs-indicator": {
                  display: "none"
                },
                "& .MuiTab-root": {
                  minHeight: 0,
                  minWidth: 0,
                  px: 1.8,
                  py: 1.1,
                  borderRadius: 999,
                  textTransform: "none",
                  fontWeight: 700,
                  color: "#4b6581"
                },
                "& .Mui-selected": {
                  color: "#113a67 !important",
                  bgcolor: "#ffffff",
                  boxShadow: "0 8px 18px rgba(15, 23, 42, 0.08)"
                }
              }}
            >
              <Tab value="builder" label="Design Studio" />
              <Tab value="runs" label={`Runs And Logs (${document.runs.length})`} />
            </Tabs>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2.5}>
        {centerVisible ? (
        <Grid item xs={12} lg={centerLg} sx={{ order: { xs: 2, lg: 2 } }}>
          <Stack spacing={2}>
            {activeTab === "builder" ? (
              <>
            <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
              <CardContent sx={{ p: 2.2 }}>
                <Stack spacing={1.25}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.5}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Scheduler</Typography>
                    </Box>
                  </Stack>
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} sm={4}>
                      <TextField select fullWidth size="small" label="Trigger" value={document.schedule.trigger} onChange={(event) => updateDocument((current) => ({ ...current, schedule: { ...current.schedule, trigger: event.target.value as NoodleDesignerSchedule["trigger"] } }))}>
                        <MenuItem value="manual">manual</MenuItem>
                        <MenuItem value="schedule">schedule</MenuItem>
                        <MenuItem value="event">event</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField fullWidth size="small" label="Timezone" value={document.schedule.timezone} onChange={(event) => updateDocument((current) => ({ ...current, schedule: { ...current.schedule, timezone: event.target.value } }))} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField select fullWidth size="small" label="Concurrency" value={document.schedule.concurrency_policy} onChange={(event) => updateDocument((current) => ({ ...current, schedule: { ...current.schedule, concurrency_policy: event.target.value as NoodleDesignerSchedule["concurrency_policy"] } }))}>
                        <MenuItem value="allow">allow</MenuItem>
                        <MenuItem value="forbid">forbid</MenuItem>
                        <MenuItem value="replace">replace</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid item xs={12} sm={8}>
                      <TextField fullWidth size="small" label="Cron" value={document.schedule.cron} disabled={document.schedule.trigger !== "schedule"} onChange={(event) => updateDocument((current) => ({ ...current, schedule: { ...current.schedule, cron: event.target.value } }))} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ height: "100%", px: 1 }}>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>Enabled</Typography>
                        <Switch checked={document.schedule.enabled} onChange={(_, checked) => updateDocument((current) => ({ ...current, schedule: { ...current.schedule, enabled: checked } }))} />
                      </Stack>
                    </Grid>
                  </Grid>
                  <Divider />
                  <Stack spacing={1}>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1} alignItems={{ xs: "flex-start", sm: "center" }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>Orchestrator Plan</Typography>
                        <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                          Create and edit the control-plane task plan before handing the versioned spec to Apache Airflow.
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Chip
                          label={document.orchestrator_plan.execution_target}
                          size="small"
                          sx={{ bgcolor: "#eef6ff", fontWeight: 700, textTransform: "capitalize" }}
                        />
                        <Button
                          size="small"
                          onClick={() => {
                            const nextTask: NoodleOrchestratorTaskPlan = {
                              id: createId("task-plan"),
                              node_id: null,
                              name: `Task ${document.orchestrator_plan.tasks.length + 1}`,
                              stage: "custom-stage",
                              plugin: "custom-plugin",
                              execution_plane: "worker",
                              depends_on: [],
                              outputs: [],
                              notes: "Manual control-plane task."
                            };
                            updateDocument((current) => ({
                              ...current,
                              orchestrator_plan: {
                                ...current.orchestrator_plan,
                                tasks: [...current.orchestrator_plan.tasks, nextTask]
                              }
                            }));
                            setSelectedTaskPlanId(nextTask.id);
                          }}
                        >
                          Add Task
                        </Button>
                      </Stack>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {document.orchestrator_plan.tasks.map((task) => (
                        <Chip
                          key={task.id}
                          label={task.name}
                          color={task.id === selectedTaskPlanId ? "primary" : "default"}
                          onClick={() => setSelectedTaskPlanId(task.id)}
                          variant={task.id === selectedTaskPlanId ? "filled" : "outlined"}
                        />
                      ))}
                    </Stack>
                    {selectedTaskPlan ? (
                      <Stack spacing={1}>
                        <TextField
                          label="Task Name"
                          size="small"
                          value={selectedTaskPlan.name}
                          onChange={(event) => updateSelectedTaskPlan((item) => ({ ...item, name: event.target.value }))}
                        />
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <TextField
                            label="Stage"
                            size="small"
                            value={selectedTaskPlan.stage}
                            onChange={(event) => updateSelectedTaskPlan((item) => ({ ...item, stage: event.target.value }))}
                            sx={{ flex: 1 }}
                          />
                          <TextField
                            label="Plugin"
                            size="small"
                            value={selectedTaskPlan.plugin}
                            onChange={(event) => updateSelectedTaskPlan((item) => ({ ...item, plugin: event.target.value }))}
                            sx={{ flex: 1 }}
                          />
                        </Stack>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <TextField
                            select
                            label="Execution Plane"
                            size="small"
                            value={selectedTaskPlan.execution_plane}
                            onChange={(event) =>
                              updateSelectedTaskPlan((item) => ({
                                ...item,
                                execution_plane: event.target.value as NoodleOrchestratorTaskPlan["execution_plane"]
                              }))
                            }
                            sx={{ flex: 1 }}
                          >
                            <MenuItem value="control_plane">control_plane</MenuItem>
                            <MenuItem value="airflow">airflow</MenuItem>
                            <MenuItem value="worker">worker</MenuItem>
                            <MenuItem value="quality">quality</MenuItem>
                            <MenuItem value="serving">serving</MenuItem>
                          </TextField>
                          <TextField
                            select
                            label="Linked Node"
                            size="small"
                            value={selectedTaskPlan.node_id ?? ""}
                            onChange={(event) =>
                              updateSelectedTaskPlan((item) => ({
                                ...item,
                                node_id: event.target.value || null
                              }))
                            }
                            sx={{ flex: 1 }}
                          >
                            <MenuItem value="">No linked node</MenuItem>
                            {document.nodes.map((node) => (
                              <MenuItem key={node.id} value={node.id}>{node.label}</MenuItem>
                            ))}
                          </TextField>
                        </Stack>
                        <TextField
                          label="Depends On"
                          size="small"
                          value={selectedTaskPlan.depends_on.join(", ")}
                          onChange={(event) =>
                            updateSelectedTaskPlan((item) => ({
                              ...item,
                              depends_on: event.target.value.split(",").map((value) => value.trim()).filter(Boolean)
                            }))
                          }
                          helperText="Comma-separated task ids."
                        />
                        <TextField
                          label="Outputs"
                          size="small"
                          value={selectedTaskPlan.outputs.join(", ")}
                          onChange={(event) =>
                            updateSelectedTaskPlan((item) => ({
                              ...item,
                              outputs: event.target.value.split(",").map((value) => value.trim()).filter(Boolean)
                            }))
                          }
                          helperText="Comma-separated zones or artifacts."
                        />
                        <TextField
                          label="Notes"
                          size="small"
                          multiline
                          minRows={2}
                          value={selectedTaskPlan.notes}
                          onChange={(event) => updateSelectedTaskPlan((item) => ({ ...item, notes: event.target.value }))}
                        />
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          {selectedTaskPlan.node_id ? (
                            <Button
                              onClick={() => {
                                setSelectedNodeId(selectedTaskPlan.node_id ?? null);
                                setSelectedEdgeId(null);
                              }}
                            >
                              Focus Node
                            </Button>
                          ) : null}
                          <Button
                            color="error"
                            onClick={() =>
                              updateDocument((current) => ({
                                ...current,
                                orchestrator_plan: {
                                  ...current.orchestrator_plan,
                                  tasks: current.orchestrator_plan.tasks.filter((task) => task.id !== selectedTaskPlan.id)
                                }
                              }))
                            }
                          >
                            Remove Task
                          </Button>
                        </Stack>
                      </Stack>
                    ) : (
                      <Alert severity="info">Add a task to create the orchestrator execution plan.</Alert>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
              <CardContent sx={{ p: 2.2 }}>
                <Stack spacing={1.25}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>DAG Canvas</Typography>
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Drag nodes from the repository, connect them on the canvas, and generate an Airflow-friendly DAG without mixing runtime code into the spec.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={() => flowInstance?.fitView({ padding: 0.16 })}>Fit View</Button>
                      <Tooltip title={canvasCollapsed ? "Expand canvas panel" : "Collapse canvas panel"}>
                        <IconButton
                          size="small"
                          onClick={() => setCanvasCollapsed((current) => !current)}
                          aria-label={canvasCollapsed ? "Expand canvas panel" : "Collapse canvas panel"}
                          sx={panelIconButtonSx}
                        >
                          {canvasCollapsed ? <ExpandMoreRoundedIcon fontSize="small" /> : <ExpandLessRoundedIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={panelFocus === "canvas" ? "Restore layout" : "Maximize canvas panel"}>
                        <IconButton
                          size="small"
                          onClick={() => setPanelFocus((current) => (current === "canvas" ? null : "canvas"))}
                          aria-label={panelFocus === "canvas" ? "Restore layout" : "Maximize canvas panel"}
                          sx={panelIconButtonSx}
                        >
                          {panelFocus === "canvas" ? <CloseFullscreenRoundedIcon fontSize="small" /> : <OpenInFullRoundedIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Button size="small" onClick={() => setCanvasExpanded((current) => !current)}>
                        {canvasExpanded ? "Reduce Height" : "Expand Height"}
                      </Button>
                      {selectedNode ? (
                        <>
                          <Button size="small" onClick={() => renameNode(selectedNode.id)}>Rename Node</Button>
                          <Button size="small" color="error" onClick={deleteSelection}>
                            Delete Node
                          </Button>
                        </>
                      ) : null}
                      {!selectedNode && selectedEdge ? (
                        <Button size="small" color="error" onClick={deleteSelection}>
                          Delete Edge
                        </Button>
                      ) : null}
                    </Stack>
                  </Stack>
                  {!canvasCollapsed ? (
                    <Box
                      data-testid="designer-canvas"
                      onDrop={handleDrop}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      sx={{ height: canvasHeight, minHeight: 520, borderRadius: 3, overflow: "hidden", border: "1px solid var(--line)", bgcolor: "#f8fbff" }}
                    >
                      <ReactFlow
                        nodes={flowNodes}
                        edges={flowEdges}
                        nodeTypes={nodeTypes}
                        fitView
                        onInit={setFlowInstance}
                        onConnect={handleConnect}
                        onNodeDragStop={handleNodeDragStop}
                        onNodeClick={(_, node) => {
                          setSelectedNodeId(node.id);
                          setSelectedEdgeId(null);
                        }}
                        onNodeDoubleClick={(_, node) => {
                          setSelectedNodeId(node.id);
                          setSelectedEdgeId(null);
                          renameNode(node.id);
                        }}
                        onEdgeClick={(_, edge) => {
                          setSelectedEdgeId(edge.id);
                          setSelectedNodeId(null);
                        }}
                        onPaneClick={() => {
                          setSelectedNodeId(null);
                          setSelectedEdgeId(null);
                        }}
                        nodesDraggable
                        nodesConnectable
                        elementsSelectable
                        connectionMode={ConnectionMode.Loose}
                      >
                        <MiniMap />
                        <Controls />
                        <Background color="#d7e5f5" gap={20} />
                      </ReactFlow>
                    </Box>
                  ) : (
                    <Alert severity="info">
                      Design canvas is collapsed. Expand it to continue placing nodes, wiring edges, and editing the DAG visually.
                    </Alert>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
              <CardContent sx={{ p: 2.2 }}>
                <Stack spacing={1.25}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Configuration</Typography>
                  {selectedNode ? (
                    <Stack spacing={1}>
                      <TextField label="Node Label" size="small" value={selectedNode.label} onChange={(event) => updateSelectedNode((node) => ({ ...node, label: event.target.value }))} />
                      <TextField select label="Node Kind" size="small" value={selectedNode.kind} onChange={(event) => updateSelectedNode((node) => ({ ...node, kind: event.target.value as NoodleDesignerNodeKind }))}>
                        {NODE_LIBRARY.map((entry) => (
                          <MenuItem key={entry.kind} value={entry.kind}>{entry.kind}</MenuItem>
                        ))}
                      </TextField>
                      {selectedNode.kind === "transform" ? (
                        <>
                          <Alert severity={selectedNodeTransformation ? "success" : "warning"}>
                            {selectedNodeTransformation
                              ? `Linked transformation: ${selectedNodeTransformation.name}`
                              : "This transform node does not have a linked transformation record yet."}
                          </Alert>
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                            <Button
                              onClick={() => {
                                if (selectedNodeTransformation) {
                                  setSelectedTransformationId(selectedNodeTransformation.id);
                                  return;
                                }

                                const nextTransformation = createTransformationForNode(
                                  selectedNode,
                                  document.transformations.length + 1
                                );
                                updateDocument((current) => ({
                                  ...current,
                                  transformations: [...current.transformations, nextTransformation]
                                }));
                                setSelectedTransformationId(nextTransformation.id);
                              }}
                            >
                              {selectedNodeTransformation ? "Open Transformation" : "Create Transformation"}
                            </Button>
                            {selectedNodeTransformation ? (
                              <Button
                                onClick={() =>
                                  updateDocument((current) => ({
                                    ...current,
                                    transformations: current.transformations.map((item) =>
                                      item.id === selectedNodeTransformation.id ? { ...item, node_id: null } : item
                                    )
                                  }))
                                }
                              >
                                Unlink Transformation
                              </Button>
                            ) : null}
                          </Stack>
                        </>
                      ) : null}
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Params</Typography>
                      {selectedNode.params.map((param, index) => (
                        <Stack key={`${selectedNode.id}-${index}`} direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <TextField label="Key" size="small" value={param.key} onChange={(event) => updateSelectedNode((node) => ({ ...node, params: node.params.map((entry, entryIndex) => (entryIndex === index ? { ...entry, key: event.target.value } : entry)) }))} sx={{ flex: 1 }} />
                          <TextField label="Value" size="small" value={param.value} onChange={(event) => updateSelectedNode((node) => ({ ...node, params: node.params.map((entry, entryIndex) => (entryIndex === index ? { ...entry, value: event.target.value } : entry)) }))} sx={{ flex: 1 }} />
                          <Button color="error" onClick={() => updateSelectedNode((node) => ({ ...node, params: node.params.filter((_, entryIndex) => entryIndex !== index) }))}>
                            Remove
                          </Button>
                        </Stack>
                      ))}
                      <Button onClick={() => updateSelectedNode((node) => ({ ...node, params: [...node.params, { key: "param", value: "" }] }))}>
                        Add Param
                      </Button>
                      <Button onClick={() => renameNode(selectedNode.id)}>
                        Rename Node
                      </Button>
                      <Button color="error" onClick={deleteSelection}>
                        Remove Node
                      </Button>
                    </Stack>
                  ) : selectedEdge ? (
                    <Stack spacing={1}>
                      <Alert severity="info">
                        Selected dependency: {document.nodes.find((node) => node.id === selectedEdge.source)?.label ?? selectedEdge.source} to {document.nodes.find((node) => node.id === selectedEdge.target)?.label ?? selectedEdge.target}
                      </Alert>
                      <Button color="error" onClick={deleteSelection}>
                        Remove Dependency
                      </Button>
                    </Stack>
                  ) : (
                    <Alert severity="info">
                      Select a node to edit task parameters or select an edge to remove a dependency.
                    </Alert>
                  )}
                </Stack>
              </CardContent>
            </Card>
              </>
            ) : (
              <>
                <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 2.2 }}>
                    <Stack spacing={1.25}>
                      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Run Control</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Trigger and inspect Apache Airflow-backed runs without leaving the designer.
                          </Typography>
                        </Box>
                        <Button variant="contained" onClick={() => void triggerRun()} sx={noodleButtonPrimarySx} disabled={remoteBusy}>
                          {remoteBusy ? "Working..." : "Trigger Airflow Run"}
                        </Button>
                      </Stack>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip label={`Runs: ${document.runs.length}`} sx={{ bgcolor: "#eef6ff" }} />
                        <Chip label={`Orchestrator: Apache Airflow`} sx={{ bgcolor: "#fff4e8" }} />
                        <Chip label={`Latest: ${selectedRun ? titleize(selectedRun.status) : "No runs"}`} sx={{ bgcolor: "#f8fbff" }} />
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 2.2 }}>
                    <Stack spacing={1.5}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Run Timeline</Typography>
                      {document.runs.map((run) => (
                        <Box
                          key={run.id}
                          onClick={() => setSelectedRunId(run.id)}
                          sx={{
                            p: 1.4,
                            borderRadius: 3,
                            border: run.id === selectedRunId ? "2px solid var(--accent)" : "1px solid var(--line)",
                            bgcolor: run.id === selectedRunId ? "#eef6ff" : "#fff",
                            cursor: "pointer"
                          }}
                        >
                          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>{run.label}</Typography>
                              <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                {new Date(run.started_at).toLocaleString()} via {run.orchestrator}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              <Chip size="small" label={titleize(run.trigger)} variant="outlined" />
                              <Chip size="small" label={titleize(run.status)} color={run.status === "success" ? "success" : run.status === "failed" ? "error" : "warning"} />
                            </Stack>
                          </Stack>
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={5}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent sx={{ p: 2.2 }}>
                        <Stack spacing={1.25}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Run Tasks</Typography>
                          {selectedRun ? (
                            selectedRun.task_runs.map((task) => (
                              <Box key={task.id} sx={{ p: 1.2, borderRadius: 2.5, border: "1px solid var(--line)", bgcolor: "#fff" }}>
                                <Stack direction="row" justifyContent="space-between" spacing={1}>
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{task.node_label}</Typography>
                                    <Typography variant="caption" sx={{ color: "var(--muted)" }}>{task.node_id}</Typography>
                                  </Box>
                                  <Chip size="small" label={task.state} color={task.state === "success" ? "success" : task.state === "failed" ? "error" : task.state === "running" ? "warning" : "default"} />
                                </Stack>
                              </Box>
                            ))
                          ) : (
                            <Alert severity="info">Trigger or select a run to inspect task state.</Alert>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={7}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent sx={{ p: 2.2 }}>
                        <Stack spacing={1.25}>
                          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Execution Logs</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              {LOG_LEVELS.map((level) => (
                                <Chip
                                  key={level}
                                  size="small"
                                  label={level === "all" ? "All Logs" : level.toUpperCase()}
                                  variant={logFilter === level ? "filled" : "outlined"}
                                  color={logFilter === level ? "primary" : "default"}
                                  onClick={() => setLogFilter(level)}
                                  sx={{ borderRadius: 999, fontWeight: 700 }}
                                />
                              ))}
                            </Stack>
                          </Stack>
                          {selectedRun ? (
                            filteredLogs.length ? (
                              filteredLogs.map((entry) => (
                                <Box key={entry.id} sx={{ p: 1.2, borderRadius: 2.5, border: "1px solid var(--line)", bgcolor: entry.level === "warn" ? "#fff8e8" : entry.level === "info" ? "#eef6ff" : "#fff" }}>
                                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                                    <Stack spacing={0.25}>
                                      <Stack direction="row" spacing={1} alignItems="center">
                                        <Chip size="small" label={entry.level.toUpperCase()} color={entry.level === "warn" ? "warning" : entry.level === "info" ? "info" : "default"} />
                                        <Typography variant="caption" sx={{ color: "var(--muted)" }}>{new Date(entry.timestamp).toLocaleString()}</Typography>
                                      </Stack>
                                      <Typography variant="body2">{entry.message}</Typography>
                                    </Stack>
                                    {entry.node_id ? <Typography variant="caption" sx={{ color: "var(--muted)" }}>{entry.node_id}</Typography> : null}
                                  </Stack>
                                </Box>
                              ))
                            ) : (
                              <Alert severity="info">No logs match the current filter.</Alert>
                            )
                          ) : (
                            <Alert severity="info">Select a run to inspect execution logs.</Alert>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </>
            )}
          </Stack>
        </Grid>
        ) : null}

        {repositoryVisible ? (
        <Grid item xs={12} lg={sideLg} sx={{ order: { xs: 1, lg: 1 } }}>
          <Stack spacing={2}>
            <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
              <CardContent sx={{ p: 2.2 }}>
                <Stack spacing={1.25}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Repository</Typography>
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Save plugin-backed connection details, metadata assets, schemas, and transformations alongside the portable JSON pipeline spec.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Tooltip title={repositoryCollapsed ? "Expand repository panel" : "Collapse repository panel"}>
                        <IconButton
                          size="small"
                          onClick={() => setRepositoryCollapsed((current) => !current)}
                          aria-label={repositoryCollapsed ? "Expand repository panel" : "Collapse repository panel"}
                          sx={panelIconButtonSx}
                        >
                          {repositoryCollapsed ? <ExpandMoreRoundedIcon fontSize="small" /> : <ExpandLessRoundedIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={panelFocus === "repository" ? "Restore layout" : "Maximize repository panel"}>
                        <IconButton
                          size="small"
                          onClick={() => setPanelFocus((current) => (current === "repository" ? null : "repository"))}
                          aria-label={panelFocus === "repository" ? "Restore layout" : "Maximize repository panel"}
                          sx={panelIconButtonSx}
                        >
                          {panelFocus === "repository" ? <CloseFullscreenRoundedIcon fontSize="small" /> : <OpenInFullRoundedIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                  <Alert severity="info">
                    Stored now: {document.connection_refs.length} connections, {document.metadata_assets.length} metadata assets, {document.schemas.length} schemas, {document.transformations.length} transformations.
                  </Alert>
                  {!repositoryCollapsed ? (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {REPOSITORY_SECTIONS.map((section) => (
                        <Chip
                          key={section}
                          label={titleize(section)}
                          color={repositorySection === section ? "primary" : "default"}
                          onClick={() => setRepositorySection(section)}
                          variant={repositorySection === section ? "filled" : "outlined"}
                          sx={{ borderRadius: 999, fontWeight: 700 }}
                        />
                      ))}
                    </Stack>
                  ) : null}
                  {!repositoryCollapsed ? (
                    <>
                  {repositorySection === "palette" ? (
                    <>
                  <Divider />

                  <Stack spacing={1}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Node Library</Typography>
                    <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                      Drag node types onto the canvas or use quick add.
                    </Typography>
                    {NODE_LIBRARY.map((entry) => (
                      <Box
                        key={entry.kind}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/noodle-node-kind", entry.kind);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        sx={{ p: 1.2, borderRadius: 2.5, border: "1px solid var(--line)", bgcolor: "#fff", cursor: "grab" }}
                      >
                        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{entry.label}</Typography>
                            <Typography variant="caption" sx={{ color: "var(--muted)" }}>{entry.description}</Typography>
                          </Box>
                          <Button size="small" onClick={() => insertNode(entry.kind)}>
                            Add
                          </Button>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                    </>
                  ) : null}

                  {repositorySection === "connections" ? (
                    <>
                  <Divider />

                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Connections</Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          const nextItem: NoodleDesignerConnectionRef = {
                            id: createId("connection"),
                            name: "new-connection",
                            plugin: "custom-plugin",
                            environment: "cloud",
                            auth_ref: "secret-ref",
                            notes: "Plugin-backed connection reference."
                          };
                          updateDocument((current) => ({ ...current, connection_refs: [...current.connection_refs, nextItem] }));
                          setSelectedConnectionId(nextItem.id);
                        }}
                      >
                        Add
                      </Button>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {document.connection_refs.map((item) => (
                        <Chip key={item.id} label={item.name} color={item.id === selectedConnectionId ? "primary" : "default"} onClick={() => setSelectedConnectionId(item.id)} variant={item.id === selectedConnectionId ? "filled" : "outlined"} />
                      ))}
                    </Stack>
                    {selectedConnection ? (
                      <Stack spacing={1}>
                        <TextField label="Connection Name" size="small" value={selectedConnection.name} onChange={(event) => updateSelectedConnection((item) => ({ ...item, name: event.target.value }))} />
                        <TextField label="Plugin" size="small" value={selectedConnection.plugin} onChange={(event) => updateSelectedConnection((item) => ({ ...item, plugin: event.target.value }))} />
                        <TextField label="Environment" size="small" value={selectedConnection.environment} onChange={(event) => updateSelectedConnection((item) => ({ ...item, environment: event.target.value }))} />
                        <TextField label="Auth Ref" size="small" value={selectedConnection.auth_ref} onChange={(event) => updateSelectedConnection((item) => ({ ...item, auth_ref: event.target.value }))} />
                        <TextField label="Notes" size="small" multiline minRows={2} value={selectedConnection.notes} onChange={(event) => updateSelectedConnection((item) => ({ ...item, notes: event.target.value }))} />
                        <Button
                          color="error"
                          onClick={() => {
                            updateDocument((current) => ({
                              ...current,
                              connection_refs: current.connection_refs.filter((item) => item.id !== selectedConnection.id),
                              schemas: current.schemas.map((schema) => (schema.source_connection_id === selectedConnection.id ? { ...schema, source_connection_id: null } : schema))
                            }));
                          }}
                        >
                          Remove Connection
                        </Button>
                      </Stack>
                    ) : null}
                  </Stack>
                    </>
                  ) : null}

                  {repositorySection === "metadata" ? (
                    <>
                  <Divider />

                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Metadata</Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          const nextItem: NoodleDesignerMetadataAsset = {
                            id: createId("metadata"),
                            name: `${document.name}-asset`,
                            zone: "silver",
                            owner: "data-platform",
                            classification: "internal",
                            tags: ["lineage"]
                          };
                          updateDocument((current) => ({ ...current, metadata_assets: [...current.metadata_assets, nextItem] }));
                          setSelectedMetadataId(nextItem.id);
                        }}
                      >
                        Add
                      </Button>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {document.metadata_assets.map((item) => (
                        <Chip key={item.id} label={item.name} color={item.id === selectedMetadataId ? "primary" : "default"} onClick={() => setSelectedMetadataId(item.id)} variant={item.id === selectedMetadataId ? "filled" : "outlined"} />
                      ))}
                    </Stack>
                    {selectedMetadata ? (
                      <Stack spacing={1}>
                        <TextField label="Asset Name" size="small" value={selectedMetadata.name} onChange={(event) => updateSelectedMetadata((item) => ({ ...item, name: event.target.value }))} />
                        <TextField select label="Zone" size="small" value={selectedMetadata.zone} onChange={(event) => updateSelectedMetadata((item) => ({ ...item, zone: event.target.value as NoodleDesignerMetadataAsset["zone"] }))}>
                          <MenuItem value="control_plane">control_plane</MenuItem>
                          <MenuItem value="bronze">bronze</MenuItem>
                          <MenuItem value="silver">silver</MenuItem>
                          <MenuItem value="gold">gold</MenuItem>
                          <MenuItem value="feature_store">feature_store</MenuItem>
                          <MenuItem value="serving">serving</MenuItem>
                        </TextField>
                        <TextField label="Owner" size="small" value={selectedMetadata.owner} onChange={(event) => updateSelectedMetadata((item) => ({ ...item, owner: event.target.value }))} />
                        <TextField label="Classification" size="small" value={selectedMetadata.classification} onChange={(event) => updateSelectedMetadata((item) => ({ ...item, classification: event.target.value }))} />
                        <TextField label="Tags" size="small" value={selectedMetadata.tags.join(", ")} onChange={(event) => updateSelectedMetadata((item) => ({ ...item, tags: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) }))} />
                        <Button color="error" onClick={() => updateDocument((current) => ({ ...current, metadata_assets: current.metadata_assets.filter((item) => item.id !== selectedMetadata.id) }))}>
                          Remove Metadata
                        </Button>
                      </Stack>
                    ) : null}
                  </Stack>
                    </>
                  ) : null}

                  {repositorySection === "schemas" ? (
                    <>
                  <Divider />

                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Schemas</Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          const nextItem: NoodleDesignerSchema = {
                            id: createId("schema"),
                            name: `${document.name}_schema_${document.schemas.length + 1}`,
                            source_connection_id: document.connection_refs[0]?.id ?? null,
                            fields: [
                              {
                                id: createId("field"),
                                name: "id",
                                type: "string",
                                nullable: false,
                                description: "Primary business identifier."
                              }
                            ]
                          };
                          updateDocument((current) => ({ ...current, schemas: [...current.schemas, nextItem] }));
                          setSelectedSchemaId(nextItem.id);
                        }}
                      >
                        Add
                      </Button>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {document.schemas.map((item) => (
                        <Chip key={item.id} label={item.name} color={item.id === selectedSchemaId ? "primary" : "default"} onClick={() => setSelectedSchemaId(item.id)} variant={item.id === selectedSchemaId ? "filled" : "outlined"} />
                      ))}
                    </Stack>
                    {selectedSchema ? (
                      <Stack spacing={1}>
                        <TextField label="Schema Name" size="small" value={selectedSchema.name} onChange={(event) => updateSelectedSchema((item) => ({ ...item, name: event.target.value }))} />
                        <TextField select label="Source Connection" size="small" value={selectedSchema.source_connection_id ?? ""} onChange={(event) => updateSelectedSchema((item) => ({ ...item, source_connection_id: event.target.value || null }))}>
                          <MenuItem value="">No connection</MenuItem>
                          {document.connection_refs.map((item) => (
                            <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>
                          ))}
                        </TextField>
                        {selectedSchema.fields.map((field) => (
                          <Box key={field.id} sx={{ p: 1.2, borderRadius: 2.5, border: "1px solid var(--line)", bgcolor: "#f8fbff" }}>
                            <Stack spacing={1}>
                              <Stack direction="row" spacing={1}>
                                <TextField label="Field" size="small" value={field.name} onChange={(event) => updateSelectedSchema((item) => ({ ...item, fields: item.fields.map((entry) => (entry.id === field.id ? { ...entry, name: event.target.value } : entry)) }))} sx={{ flex: 1 }} />
                                <TextField label="Type" size="small" value={field.type} onChange={(event) => updateSelectedSchema((item) => ({ ...item, fields: item.fields.map((entry) => (entry.id === field.id ? { ...entry, type: event.target.value } : entry)) }))} sx={{ flex: 1 }} />
                              </Stack>
                              <TextField label="Description" size="small" value={field.description} onChange={(event) => updateSelectedSchema((item) => ({ ...item, fields: item.fields.map((entry) => (entry.id === field.id ? { ...entry, description: event.target.value } : entry)) }))} />
                              <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Typography variant="caption" sx={{ color: "var(--muted)" }}>Nullable</Typography>
                                  <Switch checked={field.nullable} onChange={(_, checked) => updateSelectedSchema((item) => ({ ...item, fields: item.fields.map((entry) => (entry.id === field.id ? { ...entry, nullable: checked } : entry)) }))} />
                                </Stack>
                                <Button color="error" size="small" onClick={() => updateSelectedSchema((item) => ({ ...item, fields: item.fields.filter((entry) => entry.id !== field.id) }))}>
                                  Remove Field
                                </Button>
                              </Stack>
                            </Stack>
                          </Box>
                        ))}
                        <Button onClick={() => updateSelectedSchema((item) => ({ ...item, fields: [...item.fields, { id: createId("field"), name: `field_${item.fields.length + 1}`, type: "string", nullable: true, description: "Describe the field contract." }] }))}>
                          Add Field
                        </Button>
                        <Button color="error" onClick={() => updateDocument((current) => ({ ...current, schemas: current.schemas.filter((item) => item.id !== selectedSchema.id) }))}>
                          Remove Schema
                        </Button>
                      </Stack>
                    ) : null}
                  </Stack>
                    </>
                  ) : null}

                  {repositorySection === "transformations" ? (
                    <>
                  <Divider />

                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Transformations</Typography>
                      <Button
                        size="small"
                        onClick={() => {
                          const transformNode =
                            selectedNode?.kind === "transform"
                              ? selectedNode
                              : document.nodes.find((item) => item.kind === "transform") ?? null;
                          const nextItem = transformNode
                            ? createTransformationForNode(transformNode, document.transformations.length + 1)
                            : {
                                id: createId("transformation"),
                                node_id: null,
                                name: `${document.name}-transformation-${document.transformations.length + 1}`,
                                plugin: "transform-plugin",
                                mode: "python" as NoodleDesignerTransformationMode,
                                description: "Portable transformation that can be linked to a transform node later.",
                                code: defaultTransformationCode("Manual transformation", "python"),
                                config_json: JSON.stringify({ output_zone: "silver" }, null, 2),
                                tags: ["transform"]
                              };
                          updateDocument((current) => ({ ...current, transformations: [...current.transformations, nextItem] }));
                          setSelectedTransformationId(nextItem.id);
                        }}
                      >
                        Add
                      </Button>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {document.transformations.map((item) => (
                        <Chip
                          key={item.id}
                          label={item.name}
                          color={item.id === selectedTransformationId ? "primary" : "default"}
                          onClick={() => setSelectedTransformationId(item.id)}
                          variant={item.id === selectedTransformationId ? "filled" : "outlined"}
                        />
                      ))}
                    </Stack>
                    {selectedTransformation ? (
                      <Stack spacing={1}>
                        <TextField
                          label="Transformation Name"
                          size="small"
                          value={selectedTransformation.name}
                          onChange={(event) => updateSelectedTransformation((item) => ({ ...item, name: event.target.value }))}
                        />
                        <TextField
                          select
                          label="Linked Transform Node"
                          size="small"
                          value={selectedTransformation.node_id ?? ""}
                          onChange={(event) =>
                            updateSelectedTransformation((item) => ({
                              ...item,
                              node_id: event.target.value || null
                            }))
                          }
                        >
                          <MenuItem value="">No linked node</MenuItem>
                          {document.nodes
                            .filter((item) => item.kind === "transform")
                            .map((item) => (
                              <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>
                            ))}
                        </TextField>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <TextField
                            label="Plugin"
                            size="small"
                            value={selectedTransformation.plugin}
                            onChange={(event) => updateSelectedTransformation((item) => ({ ...item, plugin: event.target.value }))}
                            sx={{ flex: 1 }}
                          />
                          <TextField
                            select
                            label="Mode"
                            size="small"
                            value={selectedTransformation.mode}
                            onChange={(event) =>
                              updateSelectedTransformation((item) => ({
                                ...item,
                                mode: event.target.value as NoodleDesignerTransformationMode,
                                code:
                                  item.code.trim() === "" || item.code === defaultTransformationCode(item.name, item.mode)
                                    ? defaultTransformationCode(item.name, event.target.value as NoodleDesignerTransformationMode)
                                    : item.code
                              }))
                            }
                            sx={{ flex: 1 }}
                          >
                            <MenuItem value="python">python</MenuItem>
                            <MenuItem value="sql">sql</MenuItem>
                            <MenuItem value="dbt">dbt</MenuItem>
                            <MenuItem value="spark_sql">spark_sql</MenuItem>
                            <MenuItem value="custom">custom</MenuItem>
                          </TextField>
                        </Stack>
                        <TextField
                          label="Description"
                          size="small"
                          multiline
                          minRows={2}
                          value={selectedTransformation.description}
                          onChange={(event) => updateSelectedTransformation((item) => ({ ...item, description: event.target.value }))}
                        />
                        <TextField
                          label="Tags"
                          size="small"
                          value={selectedTransformation.tags.join(", ")}
                          onChange={(event) =>
                            updateSelectedTransformation((item) => ({
                              ...item,
                              tags: event.target.value.split(",").map((value) => value.trim()).filter(Boolean)
                            }))
                          }
                        />
                        <TextField
                          label="Transformation Code"
                          size="small"
                          multiline
                          minRows={6}
                          value={selectedTransformation.code}
                          onChange={(event) => updateSelectedTransformation((item) => ({ ...item, code: event.target.value }))}
                        />
                        <TextField
                          label="Config JSON"
                          size="small"
                          multiline
                          minRows={6}
                          value={selectedTransformation.config_json}
                          onChange={(event) => updateSelectedTransformation((item) => ({ ...item, config_json: event.target.value }))}
                        />
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          {selectedTransformation.node_id ? (
                            <Button
                              onClick={() => {
                                setSelectedNodeId(selectedTransformation.node_id ?? null);
                                setSelectedEdgeId(null);
                              }}
                            >
                              Focus Node
                            </Button>
                          ) : null}
                          <Button
                            color="error"
                            onClick={() =>
                              updateDocument((current) => ({
                                ...current,
                                transformations: current.transformations.filter((item) => item.id !== selectedTransformation.id)
                              }))
                            }
                          >
                            Remove Transformation
                          </Button>
                        </Stack>
                      </Stack>
                    ) : null}
                  </Stack>
                    </>
                  ) : null}

                  {repositorySection === "spec" ? (
                    <>
                  <Divider />

                  <Stack spacing={1}>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Raw Pipeline JSON</Typography>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" onClick={resetRawSpec}>
                          Reset
                        </Button>
                        <Button size="small" variant="contained" onClick={applyRawSpec} sx={noodleButtonPrimarySx}>
                          Apply JSON
                        </Button>
                      </Stack>
                    </Stack>
                    <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                      Edit the full portable pipeline spec directly when you want to define transformations or repository records by hand.
                    </Typography>
                    {rawSpecError ? <Alert severity="error">{rawSpecError}</Alert> : null}
                    <TextField
                      label="Pipeline JSON"
                      multiline
                      minRows={12}
                      value={rawSpecText}
                      onChange={(event) => {
                        setRawSpecText(event.target.value);
                        setRawSpecDirty(true);
                        setRawSpecError(null);
                      }}
                    />
                  </Stack>
                    </>
                  ) : null}
                    </>
                  ) : (
                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                      Repository content is collapsed. Expand it to manage connections, metadata, schemas, transformations, and the raw JSON spec.
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        ) : null}

        {momoVisible ? (
        <Grid item xs={12} lg={sideLg} sx={{ order: { xs: 3, lg: 3 } }}>
          <Stack spacing={2}>
            <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
              <CardContent sx={{ p: 2.2 }}>
                <Stack spacing={1.25}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Agent Momo</Typography>
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Architecture context is loaded into the assistant so it can guide pipeline design decisions.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Tooltip title={momoCollapsed ? "Expand Agent Momo panel" : "Collapse Agent Momo panel"}>
                        <IconButton
                          size="small"
                          onClick={() => setMomoCollapsed((current) => !current)}
                          aria-label={momoCollapsed ? "Expand Agent Momo panel" : "Collapse Agent Momo panel"}
                          sx={panelIconButtonSx}
                        >
                          {momoCollapsed ? <ExpandMoreRoundedIcon fontSize="small" /> : <ExpandLessRoundedIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={panelFocus === "momo" ? "Restore layout" : "Maximize Agent Momo panel"}>
                        <IconButton
                          size="small"
                          onClick={() => setPanelFocus((current) => (current === "momo" ? null : "momo"))}
                          aria-label={panelFocus === "momo" ? "Restore layout" : "Maximize Agent Momo panel"}
                          sx={panelIconButtonSx}
                        >
                          {panelFocus === "momo" ? <CloseFullscreenRoundedIcon fontSize="small" /> : <OpenInFullRoundedIcon fontSize="small" />}
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                  {!momoCollapsed ? (
                    <>
                  {architectureOverview ? (
                    <Alert severity="info">{architectureOverview.objective}</Alert>
                  ) : (
                    <Alert severity="info">Open the designer from the Noodle page to pass architecture context into Agent Momo.</Alert>
                  )}
                  {savedArchitecture ? (
                    <Alert severity="success">
                      Saved architecture loaded: {savedArchitecture.name}
                    </Alert>
                  ) : null}
                  {agentMomoBrief ? (
                    <Box sx={{ p: 1.4, borderRadius: 2.5, bgcolor: "#f8fbff", border: "1px solid var(--line)" }}>
                      <Typography variant="caption" sx={{ color: "var(--muted)", fontWeight: 800 }}>
                        MOMO BRIEF
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.6, color: "var(--text)" }}>
                        {agentMomoBrief}
                      </Typography>
                    </Box>
                  ) : null}
                  <Stack spacing={1} sx={{ maxHeight: panelFocus === "momo" ? "calc(100vh - 360px)" : 420, overflowY: "auto" }}>
                    {momoMessages.map((message) => (
                      <Box key={message.id} sx={{ alignSelf: message.role === "user" ? "flex-end" : "flex-start", maxWidth: "100%", p: 1.4, borderRadius: 3, border: "1px solid var(--line)", bgcolor: message.role === "user" ? "#eef6ff" : "#fff" }}>
                        <Typography variant="caption" sx={{ color: message.role === "user" ? "var(--accent)" : "#0b5b7f", fontWeight: 800 }}>
                          {message.role === "user" ? "YOU" : "AGENT MOMO"}
                        </Typography>
                        <Typography variant="body2" sx={{ color: "var(--text)", mt: 0.5, whiteSpace: "pre-wrap" }}>
                          {message.content}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                  <TextField label="Ask Agent Momo" multiline minRows={4} value={momoPrompt} onChange={(event) => setMomoPrompt(event.target.value)} placeholder="How should I model plugin-backed sources, metadata, scheduling, or task dependencies?" />
                  <Button variant="contained" onClick={sendMomoMessage} sx={{ bgcolor: "var(--accent)", color: "#fff", "&:hover": { bgcolor: "#265db8" } }}>
                    Send To Agent Momo
                  </Button>
                    </>
                  ) : (
                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                      Agent Momo is collapsed. Expand it to review architecture context, message history, and design guidance.
                    </Typography>
                  )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 2.2 }}>
                    <Stack spacing={1.25}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Run Notifications</Typography>
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Recent pipeline activity appears here as runs change state.
                      </Typography>
                      {latestRunNotifications.length ? (
                        latestRunNotifications.map((entry) => (
                          <Alert key={entry.id} severity={entry.severity}>
                            {entry.message}
                          </Alert>
                        ))
                      ) : (
                        <Alert severity="info">Trigger a run to start receiving execution notifications.</Alert>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 2.2 }}>
                    <Stack spacing={1.25}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Validation Status</Typography>
                  {validations.length ? (
                    validations.map((validation) => (
                      <Alert key={validation.id} severity={validation.level === "error" ? "error" : "warning"}>
                        {validation.message}
                      </Alert>
                    ))
                  ) : (
                    <Alert severity="success">Current graph, repository, and schedule settings are valid.</Alert>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        ) : null}
      </Grid>
      <Snackbar
        open={Boolean(notice)}
        autoHideDuration={3600}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {notice ? (
          <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ width: "100%" }}>
            {notice.message}
          </Alert>
        ) : <span />}
      </Snackbar>
    </Stack>
  );
}

export function NoodlePipelineDesigner(props: NoodlePipelineDesignerProps) {
  return (
    <ReactFlowProvider>
      <NoodlePipelineDesignerInner {...props} />
    </ReactFlowProvider>
  );
}
