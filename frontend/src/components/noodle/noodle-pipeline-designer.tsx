"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import CloseFullscreenRoundedIcon from "@mui/icons-material/CloseFullscreenRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { alpha } from "@mui/material/styles";
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
  createNoodlePipelineRepairRun,
  createNoodlePipelineRun,
  listNoodlePipelines,
  resumeNoodlePipelineBatchSession,
  saveNoodlePipeline
} from "@/lib/api";
import { providerColors } from "@/lib/architect-diagram";
import { copyTextToClipboard } from "@/lib/clipboard";
import type {
  NoodleArchitectureOverview,
  NoodleArchitecturePrinciple,
  NoodleDesignerCachedOutput,
  NoodleDesignerBatchSession,
  NoodleDesignerConnectionRef,
  NoodleDesignerDeployment,
  NoodleDesignerDocumentStatus,
  NoodleDesignerEdge,
  NoodleDesignerLogLevel,
  NoodleDesignerMetadataAsset,
  NoodleDesignerNode,
  NoodleDesignerNodeKind,
  NoodleOrchestratorPlan,
  NoodleOrchestratorTaskPlan,
  NoodleDesignerParam,
  NoodleDesignerRepairMode,
  NoodleDesignerRepairScope,
  NoodleDesignerRun,
  NoodleDesignerSchedule,
  NoodleDesignerSchema,
  NoodleDesignerTransformation,
  NoodleDesignerTransformationMode,
  NoodleDesignerValidation,
  NoodlePipelineDesignerDocument,
  NoodleSourceKind,
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
  deploymentSeed?: NoodleDesignerDeployment | null;
  seedDocument?: NoodlePipelineDesignerDocument | null;
  plannedOrchestratorPlan?: NoodleOrchestratorPlan | null;
}

interface DesignerNodeData {
  id: string;
  label: string;
  kind: NoodleDesignerNodeKind;
  selected: boolean;
  paramCount: number;
  hasTransformation: boolean;
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

interface MomoTransformationSuggestion {
  transformation: NoodleDesignerTransformation;
  targetNodeId: string;
  targetNodeLabel: string;
  replacesExisting: boolean;
}

const NODE_LIBRARY: Array<{ kind: NoodleDesignerNodeKind; label: string; description: string }> = [
  { kind: "source", label: "Source", description: "Declare plugin-backed entry points and external connection refs." },
  { kind: "ingest", label: "Ingest", description: "Land data through durable control-plane and worker handoff." },
  { kind: "transform", label: "Transform", description: "Run plugin-based transforms and curated processing stages." },
  { kind: "cache", label: "Cache", description: "Buffer transformed output so operators can inspect large intermediate payloads safely." },
  { kind: "quality", label: "Quality", description: "Enforce contracts, schema rules, tests, and observability gates." },
  { kind: "feature", label: "Feature", description: "Materialize reusable ML and agent-ready feature outputs." },
  { kind: "serve", label: "Serve", description: "Publish governed outputs to analytics, APIs, and downstream consumers." }
];

const NODE_COLORS: Record<NoodleDesignerNodeKind, { fill: string; stroke: string; accent: string }> = {
  source: { fill: providerColors.shared.fill, stroke: providerColors.shared.stroke, accent: providerColors.shared.text },
  ingest: { fill: providerColors.azure.fill, stroke: providerColors.azure.stroke, accent: providerColors.azure.text },
  transform: { fill: providerColors.aws.fill, stroke: providerColors.aws.stroke, accent: providerColors.aws.text },
  cache: { fill: providerColors.alibaba.fill, stroke: providerColors.alibaba.stroke, accent: providerColors.alibaba.text },
  quality: { fill: providerColors.gcp.fill, stroke: providerColors.gcp.stroke, accent: providerColors.gcp.text },
  feature: { fill: providerColors.ibm.fill, stroke: providerColors.ibm.stroke, accent: providerColors.ibm.text },
  serve: { fill: providerColors.oracle.fill, stroke: providerColors.oracle.stroke, accent: providerColors.oracle.text }
};
const NODE_CONNECTOR_POSITIONS = [20, 40, 60, 80] as const;
const CACHE_CAPTURE_LIMIT_BYTES = 30 * 1024 * 1024;
const CACHE_PREVIEW_LIMIT_BYTES = 256 * 1024;
const CACHE_OBSERVABLE_UPSTREAM_KINDS = new Set<NoodleDesignerNodeKind>(["transform", "quality", "feature", "serve"]);

const DEFAULT_SCHEDULE: NoodleDesignerSchedule = {
  trigger: "manual",
  cron: "0 * * * *",
  timezone: "UTC",
  enabled: false,
  concurrency_policy: "forbid",
  orchestration_mode: "tasks",
  if_condition: ""
};

const CANVAS_HEIGHT = 720;
const RUN_TABS = ["builder", "runs"] as const;
const LOG_LEVELS: Array<NoodleDesignerLogLevel | "all"> = ["all", "log", "info", "warn"];
const REPAIR_SCOPE_OPTIONS: NoodleDesignerRepairScope[] = [
  "failed_and_dependents",
  "failed",
  "selected_and_dependents",
  "selected"
];
const REPAIR_MODE_OPTIONS: NoodleDesignerRepairMode[] = ["best_effort", "exact"];
const PANEL_FOCUS = ["repository", "canvas", "momo"] as const;
const REPOSITORY_SECTIONS = ["palette", "connections", "deployment", "metadata", "schemas", "transformations", "spec"] as const;
const CONNECTION_PLUGIN_OPTIONS = [
  "api-plugin",
  "database-plugin",
  "postgres-plugin",
  "postgresql-plugin",
  "mysql-plugin",
  "mariadb-plugin",
  "sqlserver-plugin",
  "azure-sql-plugin",
  "oracle-plugin",
  "snowflake-plugin",
  "s3-plugin",
  "azure-blob-plugin",
  "gcs-plugin",
  "stream-plugin",
  "file-plugin",
  "iot-plugin",
  "saas-plugin",
  "github-plugin",
  "custom-plugin"
] as const;
type ConnectionTemplate = {
  environment: string;
  authRef: string;
  notes: string;
  params: NoodleDesignerParam[];
};
const DEPLOYMENT_TARGET_OPTIONS: NoodleDesignerDeployment["deploy_target"][] = [
  "local_docker",
  "kubernetes",
  "airflow_worker",
  "worker_runtime",
  "custom"
];
const DEPLOYMENT_PROVIDER_OPTIONS: NoodleDesignerDeployment["repository"]["provider"][] = [
  "github",
  "gitlab",
  "bitbucket",
  "custom"
];
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
const workspaceTabsSx = {
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
};
const noodleGlassCardSx = {
  borderRadius: 4,
  border: "1px solid rgba(154, 177, 205, 0.45)",
  boxShadow: "0 24px 50px rgba(15, 23, 42, 0.08)",
  bgcolor: "rgba(255,255,255,0.8)",
  backdropFilter: "blur(18px)"
};
const noodleMetricCardSx = {
  p: 1.75,
  height: "100%",
  borderRadius: 4,
  color: "#f8fbff",
  position: "relative",
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.22)",
  boxShadow: "0 18px 36px rgba(15, 23, 42, 0.16)",
  background:
    "linear-gradient(160deg, rgba(8, 27, 56, 0.94) 0%, rgba(22, 76, 142, 0.84) 58%, rgba(51, 128, 173, 0.78) 100%)",
  "&::before": {
    content: '""',
    position: "absolute",
    inset: "auto -15% -45% 45%",
    height: 160,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 72%)"
  }
};
const noodleSectionLabelSx = {
  color: "rgba(232, 241, 255, 0.76)",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase"
};
const sidePanelHeroSx = {
  p: 1.5,
  borderRadius: 4,
  border: "1px solid rgba(255,255,255,0.7)",
  background:
    "radial-gradient(circle at top right, rgba(120, 216, 255, 0.2), transparent 24%), linear-gradient(160deg, rgba(8, 27, 56, 0.04) 0%, rgba(32, 92, 134, 0.08) 100%)"
};
const repositorySectionChipSx = (selected: boolean) => ({
  borderRadius: 999,
  fontWeight: 800,
  px: 0.4,
  color: selected ? "#0e4e8b" : "#4f6480",
  bgcolor: selected ? "#e6f2ff" : "rgba(255,255,255,0.82)",
  border: selected ? "1px solid rgba(47, 110, 201, 0.26)" : "1px solid rgba(154, 177, 205, 0.3)"
});
const repositoryContentCardSx = {
  p: 1.4,
  borderRadius: 3.5,
  border: "1px solid rgba(154, 177, 205, 0.3)",
  bgcolor: "rgba(255,255,255,0.88)",
  boxShadow: "0 14px 30px rgba(15, 23, 42, 0.05)"
};
const repositoryListChipSx = (selected: boolean) => ({
  borderRadius: 999,
  fontWeight: 800,
  bgcolor: selected ? "#0e4e8b" : "rgba(255,255,255,0.92)",
  color: selected ? "#fff" : "#405b78",
  border: selected ? "1px solid rgba(14, 78, 139, 0.24)" : "1px solid rgba(154, 177, 205, 0.3)",
  boxShadow: selected ? "0 10px 20px rgba(14, 78, 139, 0.18)" : "none"
});

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function stateChipColor(state: NoodleDesignerRun["status"] | NoodleDesignerRun["task_runs"][number]["state"]) {
  switch (state) {
    case "success":
      return "success";
    case "failed":
      return "error";
    case "running":
    case "retrying":
      return "warning";
    case "reused":
      return "info";
    default:
      return "default";
  }
}

function supportChipColor(level: "exact" | "best_effort" | "unsafe" | "blocked") {
  switch (level) {
    case "exact":
      return "success";
    case "best_effort":
      return "warning";
    case "unsafe":
    case "blocked":
      return "error";
    default:
      return "default";
  }
}

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function parseCachedOutputTable(previewText: string) {
  const trimmed = previewText.trim();
  if (!trimmed) {
    return null;
  }

  const buildTable = (rows: Array<Record<string, unknown>>) => {
    if (!rows.length) {
      return null;
    }

    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    if (!columns.length) {
      return null;
    }

    return {
      columns,
      rows
    };
  };

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      const rows = parsed.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
      const table = buildTable(rows);
      if (table) {
        return table;
      }
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const nestedRows = ["rows", "items", "data"]
        .map((key) => record[key])
        .find((value) => Array.isArray(value));

      if (Array.isArray(nestedRows)) {
        const rows = nestedRows.filter(
          (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
        );
        const table = buildTable(rows);
        if (table) {
          return table;
        }
      }

      const singleRowTable = buildTable([record]);
      if (singleRowTable) {
        return singleRowTable;
      }
    }
  } catch {
    // Fall through to JSONL or CSV parsing.
  }

  const lines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  const parsedRows: Array<Record<string, unknown>> = [];
  for (const [index, line] of lines.entries()) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      parsedRows.push(parsed as Record<string, unknown>);
    } catch {
      if (index === lines.length - 1 && parsedRows.length) {
        break;
      }
      parsedRows.length = 0;
      break;
    }
  }

  const jsonlTable = buildTable(parsedRows);
  if (jsonlTable) {
    return jsonlTable;
  }

  if (lines.length >= 2 && lines[0].includes(",")) {
    const headers = lines[0].split(",").map((value) => value.trim()).filter(Boolean);
    if (!headers.length) {
      return null;
    }

    const rows = lines
      .slice(1)
      .map((line) => line.split(",").map((value) => value.trim()))
      .filter((values) => values.some((value) => value.length))
      .map<Record<string, unknown>>((values) =>
        headers.reduce<Record<string, unknown>>((row, header, headerIndex) => {
          row[header] = values[headerIndex] ?? "";
          return row;
        }, {})
      );

    return buildTable(rows);
  }

  return null;
}

function formatCachedCellValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
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
    case "cache":
      return [
        { key: "capture_mode", value: "transformed_output" },
        { key: "max_capture_mb", value: "30" },
        { key: "preview_kb", value: "256" },
        { key: "format", value: "jsonl" }
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

function cloneConnectionParams(params: NoodleDesignerParam[]) {
  return params.map((param) => ({ ...param }));
}

function buildConnectionTemplate(
  environment: string,
  authRef: string,
  notes: string,
  params: Array<[key: string, value: string]>
): ConnectionTemplate {
  return {
    environment,
    authRef,
    notes,
    params: params.map(([key, value]) => ({ key, value }))
  };
}

const CONNECTION_PLUGIN_TEMPLATES: Record<string, ConnectionTemplate> = {
  "database-plugin": buildConnectionTemplate(
    "on_prem",
    "",
    "Generic relational source. Set db_kind to postgres, mysql, sqlserver, azure_sql, oracle, or snowflake.",
    [
      ["db_kind", "postgresql"],
      ["host", "localhost"],
      ["port", "5432"],
      ["database", "app"],
      ["username", "app_user"],
      ["password", "secret"]
    ]
  ),
  "postgres-plugin": buildConnectionTemplate(
    "on_prem",
    "postgresql://user:password@localhost:5432/app",
    "PostgreSQL source connection. Use either the DSN in auth_ref or the structured params below.",
    [
      ["host", "localhost"],
      ["port", "5432"],
      ["database", "app"],
      ["username", "postgres"],
      ["password", "secret"],
      ["sslmode", "prefer"]
    ]
  ),
  "postgresql-plugin": buildConnectionTemplate(
    "on_prem",
    "postgresql://user:password@localhost:5432/app",
    "PostgreSQL source connection. Use either the DSN in auth_ref or the structured params below.",
    [
      ["host", "localhost"],
      ["port", "5432"],
      ["database", "app"],
      ["username", "postgres"],
      ["password", "secret"],
      ["sslmode", "prefer"]
    ]
  ),
  "mysql-plugin": buildConnectionTemplate(
    "on_prem",
    "mysql://user:password@localhost:3306/app",
    "MySQL source connection using URI or structured params.",
    [
      ["host", "localhost"],
      ["port", "3306"],
      ["database", "app"],
      ["username", "mysql"],
      ["password", "secret"],
      ["charset", "utf8mb4"]
    ]
  ),
  "mariadb-plugin": buildConnectionTemplate(
    "on_prem",
    "mariadb://user:password@localhost:3306/app",
    "MariaDB source connection using URI or structured params.",
    [
      ["host", "localhost"],
      ["port", "3306"],
      ["database", "app"],
      ["username", "mariadb"],
      ["password", "secret"],
      ["charset", "utf8mb4"]
    ]
  ),
  "sqlserver-plugin": buildConnectionTemplate(
    "on_prem",
    "",
    "SQL Server source connection. Use an ODBC connection string in auth_ref or the fields below.",
    [
      ["host", "localhost"],
      ["port", "1433"],
      ["database", "app"],
      ["username", "sa"],
      ["password", "secret"],
      ["driver", "ODBC Driver 18 for SQL Server"],
      ["encrypt", "false"],
      ["trust_server_certificate", "true"]
    ]
  ),
  "azure-sql-plugin": buildConnectionTemplate(
    "azure",
    "",
    "Azure SQL source connection. Use an ODBC connection string in auth_ref or the fields below.",
    [
      ["host", "demo-server.database.windows.net"],
      ["port", "1433"],
      ["database", "app"],
      ["username", "demo_user"],
      ["password", "secret"],
      ["driver", "ODBC Driver 18 for SQL Server"],
      ["encrypt", "true"],
      ["trust_server_certificate", "false"]
    ]
  ),
  "oracle-plugin": buildConnectionTemplate(
    "on_prem",
    "",
    "Oracle source connection. Use a DSN in auth_ref or set host, port, service_name, and credentials.",
    [
      ["host", "localhost"],
      ["port", "1521"],
      ["service_name", "FREEPDB1"],
      ["username", "system"],
      ["password", "secret"]
    ]
  ),
  "snowflake-plugin": buildConnectionTemplate(
    "cloud",
    "",
    "Snowflake connection. The same connection ref can be used for source reads or sink writes.",
    [
      ["account", "demo-account"],
      ["user", "demo-user"],
      ["password", "secret"],
      ["warehouse", "DEMO_WH"],
      ["database", "RAW"],
      ["schema", "PUBLIC"],
      ["role", "SYSADMIN"]
    ]
  ),
  "s3-plugin": buildConnectionTemplate(
    "aws",
    "",
    "S3 source connection. Store AWS credentials here or rely on the local environment.",
    [
      ["region_name", "us-east-1"],
      ["aws_access_key_id", ""],
      ["aws_secret_access_key", ""],
      ["aws_session_token", ""]
    ]
  ),
  "azure-blob-plugin": buildConnectionTemplate(
    "azure",
    "UseDevelopmentStorage=true",
    "Azure Blob source connection. Put the connection string in auth_ref or set structured client settings.",
    [
      ["account_url", ""],
      ["credential", ""]
    ]
  ),
  "gcs-plugin": buildConnectionTemplate(
    "gcp",
    "file://path/to/service-account.json",
    "GCS source connection. Use a service-account JSON file path in auth_ref or structured client settings.",
    [
      ["project", ""]
    ]
  ),
  "github-plugin": buildConnectionTemplate(
    "saas",
    "github-token-or-file://path/to/github-export.jsonl",
    "GitHub App token, personal access token, or local export path for repositories, issues, pull requests, and webhook events.",
    [
      ["owner", ""],
      ["repository", ""],
      ["branch", "main"]
    ]
  ),
  "custom-plugin": buildConnectionTemplate(
    "cloud",
    "secret-ref",
    "Plugin-backed connection reference.",
    [
      ["key", "value"]
    ]
  )
};

function connectionTemplateForPlugin(plugin: string): ConnectionTemplate | null {
  return CONNECTION_PLUGIN_TEMPLATES[plugin] ?? null;
}

function authRefHelperTextForPlugin(plugin: string) {
  const template = connectionTemplateForPlugin(plugin);
  if (template) {
    return template.notes;
  }
  return "Use a secret reference, token handle, DSN, or local file path.";
}

function connectionParameterHelpText(plugin: string) {
  switch (plugin) {
    case "database-plugin":
      return "Set db_kind plus the host, port, database, username, and password needed for the chosen relational source.";
    case "snowflake-plugin":
      return "Snowflake typically needs account, user, password, warehouse, database, schema, and optionally role.";
    case "sqlserver-plugin":
    case "azure-sql-plugin":
      return "SQL Server family connections usually need host, port, database, username, password, driver, and TLS settings.";
    case "oracle-plugin":
      return "Oracle typically needs host, port, service_name or sid, plus username and password.";
    default:
      return "These key/value pairs travel with the pipeline spec and are merged into the runtime adapter config.";
  }
}

function applyConnectionTemplate(
  connection: NoodleDesignerConnectionRef,
  plugin: string,
  mode: "fill" | "replace" = "fill"
): NoodleDesignerConnectionRef {
  const template = connectionTemplateForPlugin(plugin);
  if (!template) {
    return { ...connection, plugin };
  }
  const shouldReplace = mode === "replace";
  return {
    ...connection,
    plugin,
    environment: shouldReplace || !connection.environment ? template.environment : connection.environment,
    auth_ref: shouldReplace || !connection.auth_ref ? template.authRef : connection.auth_ref,
    notes: shouldReplace || !connection.notes ? template.notes : connection.notes,
    params:
      shouldReplace || !connection.params.length
        ? cloneConnectionParams(template.params)
        : connection.params
  };
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

function buildConnectionRef(
  kind: NoodleSourceKind | "custom",
  sourceName?: string
): NoodleDesignerConnectionRef {
  const normalizedName = sourceName?.trim() || kind;
  const plugin =
    kind === "github"
      ? "github-plugin"
      : kind === "database"
        ? "database-plugin"
        : kind === "custom"
          ? "custom-plugin"
          : `${kind}-plugin`;
  const template = connectionTemplateForPlugin(plugin);
  return {
    id: createId("connection"),
    name: kind === "custom" ? "new-connection" : `${normalizedName}-connection`,
    plugin,
    environment: template?.environment ?? (kind === "saas" ? "saas" : kind === "iot" ? "edge" : "on_prem"),
    auth_ref: template?.authRef ?? `${normalizedName}-secret`,
    params: cloneConnectionParams(template?.params ?? []),
    notes: template?.notes ?? `${titleize(kind)} plugin for ${normalizedName}.`
  };
}

function createConnectionRefFromSource(source: NoodleSourceSystem): NoodleDesignerConnectionRef {
  return buildConnectionRef(source.kind, source.name);
}

function createDefaultDeployment(intentName: string, connectionRefs: NoodleDesignerConnectionRef[]): NoodleDesignerDeployment {
  const githubConnection = connectionRefs.find((item) => item.plugin === "github-plugin") ?? null;
  return {
    enabled: Boolean(githubConnection),
    deploy_target: "local_docker",
    repository: {
      provider: "github",
      connection_id: githubConnection?.id ?? null,
      repository: githubConnection ? `your-org/${intentName}` : "",
      branch: "main",
      backend_path: "app",
      workflow_ref: ".github/workflows/deploy.yml"
    },
    build_command: "docker build -t noodle-pipeline-backend .",
    deploy_command: "docker compose up -d --build",
    artifact_name: `${intentName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-backend`,
    notes: "Store backend deployment settings here when this pipeline is backed by a Git repository."
  };
}

function mergeDeploymentSeed(
  base: NoodleDesignerDeployment,
  deploymentSeed?: NoodleDesignerDeployment | null
): NoodleDesignerDeployment {
  if (!deploymentSeed) {
    return base;
  }

  return {
    ...base,
    ...deploymentSeed,
    repository: {
      ...base.repository,
      ...deploymentSeed.repository
    }
  };
}

function createSchemaFieldsForSource(source: NoodleSourceSystem): NoodleDesignerSchema["fields"] {
  return [
    {
      id: createId("field"),
      name: "repository",
      type: "string",
      nullable: false,
      description: "GitHub repository full name."
    },
    {
      id: createId("field"),
      name: "event_type",
      type: "string",
      nullable: false,
      description: "Webhook event type or GitHub object family."
    },
    {
      id: createId("field"),
      name: "actor_login",
      type: "string",
      nullable: true,
      description: "GitHub user or app that produced the event."
    },
    {
      id: createId("field"),
      name: "commit_sha",
      type: "string",
      nullable: true,
      description: "Commit SHA when the event relates to code changes."
    },
    {
      id: createId("field"),
      name: "payload",
      type: source.format_hint || "github json",
      nullable: false,
      description: "Raw GitHub event or API payload."
    }
  ];
}

function createSchemaFromSource(source: NoodleSourceSystem, connectionId?: string): NoodleDesignerSchema {
  const fields =
    source.kind === "github"
      ? createSchemaFieldsForSource(source)
      : [
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
        ];
  return {
    id: createId("schema"),
    name: `${source.name}_schema`,
    source_connection_id: connectionId ?? null,
    fields
  };
}

function createSourceDesignerNode(
  source: NoodleSourceSystem,
  position: { x: number; y: number },
  connectionId: string
): NoodleDesignerNode {
  const node = createDesignerNode("source", position, source.name.replaceAll("_", " "));
  return {
    ...node,
    params: [
      { key: "plugin", value: `${source.kind}-plugin` },
      { key: "connection_ref", value: connectionId },
      { key: "format", value: source.kind === "github" ? "jsonl" : "jsonl" },
      { key: "change_pattern", value: source.change_pattern },
      { key: "source_kind", value: source.kind }
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
    case "cache":
      return "cache-observer-plugin";
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
    case "cache":
      return "worker";
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
    case "cache":
      return "cache-observer";
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
    outputs: [
      node.kind === "serve"
        ? "serving"
        : node.kind === "quality"
          ? "quality-report"
          : node.kind === "cache"
            ? "cached-preview"
            : `${node.kind}-output`
    ],
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
        id: plan.id || createId("orchestrator-plan"),
        name: plan.name || `${documentName} orchestrator plan`,
        objective: plan.objective || `Coordinate ${documentName} through a versioned control-plane plan.`,
        execution_target: plan.execution_target || workflowTemplate || "apache-airflow",
        tasks: plan.tasks.map((task) => ({
          ...task,
          id: task.id || createId("task-plan"),
          depends_on: task.depends_on ?? [],
          outputs: task.outputs ?? []
        })),
        notes:
          plan.notes?.length
            ? plan.notes
            : [
                "Keep scheduling, versioning, and metadata in the control plane.",
                "Hand the saved JSON pipeline spec to Apache Airflow for DAG execution.",
                "Treat logs, metrics, and lineage as part of the plan contract."
              ]
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

  return synchronizeOrchestratorPlan(nodes, {
    ...nextPlan,
    trigger,
    execution_target: workflowTemplate ?? nextPlan.execution_target ?? "apache-airflow"
  });
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

function nodeParamsToMap(node: NoodleDesignerNode) {
  return Object.fromEntries(
    node.params
      .map((param) => [param.key.trim().toLowerCase(), param.value.trim()] as const)
      .filter(([key]) => Boolean(key))
  );
}

function coercePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function repeatToSize(seed: string, targetBytes: number) {
  const encoder = new TextEncoder();
  if (targetBytes <= 0) {
    return "";
  }
  const encoded = encoder.encode(seed);
  if (encoded.length >= targetBytes) {
    return new TextDecoder().decode(encoded.slice(0, targetBytes));
  }

  let output = seed;
  while (encoder.encode(output).length < targetBytes) {
    output += `\n${seed}`;
  }
  return new TextDecoder().decode(encoder.encode(output).slice(0, targetBytes));
}

function buildCachedOutputs(
  nodes: NoodleDesignerNode[],
  edges: NoodleDesignerEdge[],
  transformations: NoodleDesignerTransformation[],
  scopedNodeId?: string | null
): NoodleDesignerCachedOutput[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const upstreamMap = new Map<string, string[]>();
  for (const edge of edges) {
    upstreamMap.set(edge.target, [...(upstreamMap.get(edge.target) ?? []), edge.source]);
  }
  const transformationByNodeId = new Map(
    transformations
      .filter((transformation): transformation is NoodleDesignerTransformation & { node_id: string } => Boolean(transformation.node_id))
      .map((transformation) => [transformation.node_id, transformation])
  );
  const selectedNode = scopedNodeId ? nodeById.get(scopedNodeId) ?? null : null;

  return nodes
    .filter((node) => node.kind === "cache")
    .filter((cacheNode) => {
      if (!selectedNode) {
        return true;
      }
      const upstreamIds = upstreamMap.get(cacheNode.id) ?? [];
      return cacheNode.id === selectedNode.id || upstreamIds.includes(selectedNode.id);
    })
    .flatMap((cacheNode) => {
      const upstreamNodes = (upstreamMap.get(cacheNode.id) ?? [])
        .map((nodeId) => nodeById.get(nodeId) ?? null)
        .filter((node): node is NoodleDesignerNode => Boolean(node));
      if (!upstreamNodes.length) {
        return [];
      }

      const sourceNode = upstreamNodes.find((node) => CACHE_OBSERVABLE_UPSTREAM_KINDS.has(node.kind)) ?? upstreamNodes[0];
      const params = nodeParamsToMap(cacheNode);
      const maxCaptureBytes = Math.min(coercePositiveInt(params.max_capture_mb, 30) * 1024 * 1024, CACHE_CAPTURE_LIMIT_BYTES);
      const previewBytesLimit = Math.min(coercePositiveInt(params.preview_kb, 256) * 1024, maxCaptureBytes, CACHE_PREVIEW_LIMIT_BYTES);
      const rawFormat = (params.format ?? "jsonl").toLowerCase();
      const format: NoodleDesignerCachedOutput["format"] =
        rawFormat === "json" || rawFormat === "csv" || rawFormat === "text" || rawFormat === "jsonl"
          ? rawFormat
          : "jsonl";
      const transformName = transformationByNodeId.get(sourceNode.id)?.name ?? `${sourceNode.label} pass-through`;

      const seedPreview =
        format === "json"
          ? JSON.stringify(
              {
                cache_node: cacheNode.label,
                source_node: sourceNode.label,
                transform: transformName,
                partition: "2026-04-09/hour=17",
                rows_out: 176884,
                status: "captured"
              },
              null,
              2
            )
          : format === "csv"
            ? [
                "cache_node,source_node,transform,partition,status,rows_out",
                `${cacheNode.label},${sourceNode.label},${transformName},2026-04-09/hour=17,captured,176884`
              ].join("\n")
            : format === "text"
              ? [
                  `Cache node: ${cacheNode.label}`,
                  `Source node: ${sourceNode.label}`,
                  `Transformation: ${transformName}`,
                  "Rows out: 176884",
                  "Status: captured"
                ].join("\n")
              : Array.from({ length: 6 }, (_, index) =>
                  JSON.stringify({
                    cache_node: cacheNode.label,
                    source_node: sourceNode.label,
                    transform: transformName,
                    record_id: index + 1,
                    normalized_value: `value-${String(index + 1).padStart(5, "0")}`,
                    quality_state: (index + 1) % 5 === 0 ? "needs_review" : "accepted",
                    captured_at: new Date().toISOString()
                  })
                ).join("\n");

      const previewText = repeatToSize(seedPreview, previewBytesLimit);
      const previewBytes = new TextEncoder().encode(previewText).length;
      const capturedBytes = Math.min(maxCaptureBytes, Math.max(previewBytes, 12 * 1024 * 1024));

      return [
        {
          id: createId("cache-output"),
          node_id: cacheNode.id,
          node_label: cacheNode.label,
          source_node_id: sourceNode.id,
          source_node_label: sourceNode.label,
          format,
          content_type:
            format === "json"
              ? "application/json"
              : format === "csv"
                ? "text/csv"
                : format === "text"
                  ? "text/plain"
                  : "application/x-ndjson",
          summary: `${cacheNode.label} buffered transformed output from ${sourceNode.label} with a ${Math.round(maxCaptureBytes / 1024 / 1024)} MB ceiling.`,
          preview_text: previewText,
          preview_bytes: previewBytes,
          captured_bytes: capturedBytes,
          max_capture_bytes: maxCaptureBytes,
          truncated: capturedBytes > previewBytes,
          approx_records: Math.max(1, Math.floor(capturedBytes / 512))
        }
      ];
    });
}

function createSeedRuns(
  nodes: NoodleDesignerNode[],
  edges: NoodleDesignerEdge[],
  transformations: NoodleDesignerTransformation[]
): NoodleDesignerRun[] {
  const now = Date.now();
  const sourceNode = nodes.find((node) => node.kind === "source") ?? nodes[0];
  const runningNode = nodes.find((node) => node.kind === "transform") ?? nodes[1] ?? nodes[0];
  const manualCachedOutputs = buildCachedOutputs(nodes, edges, transformations);
  const scheduledCachedOutputs = buildCachedOutputs(nodes, edges, transformations);

  return [
    {
      id: createId("run"),
      label: "Manual run",
      orchestrator: "Apache Airflow",
      status: "running",
      trigger: "manual",
      orchestration_mode: "tasks",
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
      ],
      cached_outputs: manualCachedOutputs
    },
    {
      id: createId("run"),
      label: "Scheduled hourly run",
      orchestrator: "Apache Airflow",
      status: "success",
      trigger: "schedule",
      orchestration_mode: "tasks",
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
      ],
      cached_outputs: scheduledCachedOutputs
    }
  ];
}

function buildSeedDocument(
  intentName: string,
  sources: NoodleSourceSystem[],
  workflowTemplate?: string | null,
  deploymentSeed?: NoodleDesignerDeployment | null,
  plannedOrchestratorPlan?: NoodleOrchestratorPlan | null
): NoodlePipelineDesignerDocument {
  const connectionRefs = sources.map((source) => createConnectionRefFromSource(source));
  const deployment = mergeDeploymentSeed(createDefaultDeployment(intentName, connectionRefs), deploymentSeed);
  const sourceNodes = sources.map((source, index) =>
    createSourceDesignerNode(source, { x: 40, y: 70 + index * 130 }, connectionRefs[index]?.id ?? "source-connection")
  );
  const ingestNode = createDesignerNode("ingest", { x: 320, y: 130 }, "Landing ingest");
  const transformNode = createDesignerNode("transform", { x: 620, y: 130 }, "Curate transforms");
  const cacheNode = createDesignerNode("cache", { x: 920, y: 130 }, "Cache transform output");
  const qualityNode = createDesignerNode("quality", { x: 1220, y: 130 }, "Quality gate");
  const serveNode = createDesignerNode("serve", { x: 1520, y: 130 }, "Serve outputs");
  const transformations = [createTransformationForNode(transformNode, 1)];
  const nodes = [...sourceNodes, ingestNode, transformNode, cacheNode, qualityNode, serveNode];
  const edges = [
    ...sourceNodes.map((node) => ({ id: createId("edge"), source: node.id, target: ingestNode.id })),
    { id: createId("edge"), source: ingestNode.id, target: transformNode.id },
    { id: createId("edge"), source: transformNode.id, target: cacheNode.id },
    { id: createId("edge"), source: cacheNode.id, target: qualityNode.id },
    { id: createId("edge"), source: qualityNode.id, target: serveNode.id }
  ];

  return {
    id: createId("pipeline"),
    name: intentName,
    status: "draft",
    version: 1,
    nodes,
    edges,
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
    deployment,
    orchestrator_plan: createOrchestratorPlan(intentName, DEFAULT_SCHEDULE.trigger, workflowTemplate, nodes, plannedOrchestratorPlan),
    schedule: DEFAULT_SCHEDULE,
    runs: createSeedRuns(nodes, edges, transformations),
    saved_at: new Date().toISOString()
  };
}

function normalizeDocument(
  document: NoodlePipelineDesignerDocument | null,
  intentName: string,
  sources: NoodleSourceSystem[],
  workflowTemplate?: string | null,
  deploymentSeed?: NoodleDesignerDeployment | null,
  plannedOrchestratorPlan?: NoodleOrchestratorPlan | null
): NoodlePipelineDesignerDocument {
  const seed = buildSeedDocument(intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan);
  if (!document) {
    return seed;
  }

  return {
    ...seed,
    ...document,
    connection_refs: (document.connection_refs ?? seed.connection_refs).map((connection) => ({
      ...connection,
      params: connection.params ?? []
    })),
    metadata_assets: document.metadata_assets ?? seed.metadata_assets,
    schemas: document.schemas ?? seed.schemas,
    transformations: synchronizeTransformations(
      document.nodes ?? seed.nodes,
      document.transformations ?? seed.transformations
    ),
    deployment: document.deployment ?? seed.deployment,
    orchestrator_plan: createOrchestratorPlan(
      document.name ?? seed.name,
      document.schedule?.trigger ?? seed.schedule.trigger,
      workflowTemplate,
      document.nodes ?? seed.nodes,
      document.orchestrator_plan ?? plannedOrchestratorPlan ?? seed.orchestrator_plan
    ),
    schedule: document.schedule ?? seed.schedule,
    batch_sessions: (document.batch_sessions ?? seed.batch_sessions ?? []).map((session) => ({
      ...session,
      related_run_ids: session.related_run_ids ?? [],
      attempts: session.attempts ?? []
    })),
    runs: (document.runs ?? seed.runs).map((run) => ({
      ...run,
      repair_plan: run.repair_plan
        ? {
            ...run.repair_plan,
            rerun_task_ids: run.repair_plan.rerun_task_ids ?? [],
            reused_task_ids: run.repair_plan.reused_task_ids ?? [],
            downstream_task_ids: run.repair_plan.downstream_task_ids ?? [],
            validation_issues: run.repair_plan.validation_issues ?? []
          }
        : null,
      repaired_task_ids: run.repaired_task_ids ?? [],
      reused_task_ids: run.reused_task_ids ?? [],
      batch_session_ids: run.batch_session_ids ?? [],
      cached_outputs: run.cached_outputs ?? [],
      sink_bindings: run.sink_bindings ?? [],
      lineage_records: run.lineage_records ?? []
    }))
  };
}

function validateDocument(document: NoodlePipelineDesignerDocument): NoodleDesignerValidation[] {
  const validations: NoodleDesignerValidation[] = [];
  const nodeIds = new Set(document.nodes.map((node) => node.id));
  const nodeById = new Map(document.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  const upstreamByNode = new Map<string, string[]>();
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
    upstreamByNode.set(edge.target, [...(upstreamByNode.get(edge.target) ?? []), edge.source]);
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
    if (node.kind === "cache") {
      if (!hasOutgoing) {
        validations.push({
          id: `cache-downstream-${node.id}`,
          level: "warning",
          message: `${node.label} buffers output but is not wired to any downstream consumer.`
        });
      }
      const upstreamNodes = (upstreamByNode.get(node.id) ?? [])
        .map((nodeId) => nodeById.get(nodeId))
        .filter((entry): entry is NoodleDesignerNode => Boolean(entry));
      if (upstreamNodes.length && !upstreamNodes.some((entry) => CACHE_OBSERVABLE_UPSTREAM_KINDS.has(entry.kind))) {
        validations.push({
          id: `cache-upstream-${node.id}`,
          level: "warning",
          message: `${node.label} should sit after a transform, quality, feature, or serve node to observe transformed output.`
        });
      }
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
  if (document.deployment.enabled) {
    if (!document.deployment.repository.repository.trim() && !document.deployment.repository.connection_id?.trim()) {
      validations.push({
        id: "deployment-repository",
        level: "error",
        message: "Deployment is enabled, but no Git repository or Git connection is configured."
      });
    }
    if (!document.deployment.build_command.trim()) {
      validations.push({
        id: "deployment-build",
        level: "warning",
        message: "Deployment is enabled, but the backend build command is empty."
      });
    }
    if (!document.deployment.deploy_command.trim()) {
      validations.push({
        id: "deployment-deploy",
        level: "warning",
        message: "Deployment is enabled, but the deploy command is empty."
      });
    }
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
  savedArchitecture?: SavedArchitectureDraft | null
) {
  const overviewText = overview?.objective ?? "Use the control-plane architecture to guide pipeline design decisions.";
  const principlesText = principles.length
    ? `Focus on ${principles.slice(0, 3).map((principle) => principle.title.toLowerCase()).join(", ")}.`
    : "Apply plugin contracts, versioning, and observability-first design.";
  const architectureText = savedArchitecture
    ? `Saved architecture "${savedArchitecture.name}" is loaded as the platform context.`
    : "No saved architecture draft was passed in, so use the platform blueprint as the default context.";
  return `${overviewText} ${principlesText} ${architectureText}`;
}

function inferTransformationMode(
  prompt: string,
  existingTransformation?: NoodleDesignerTransformation | null
): NoodleDesignerTransformationMode {
  const lowerPrompt = prompt.toLowerCase();
  if (lowerPrompt.includes("dbt")) {
    return "dbt";
  }
  if (lowerPrompt.includes("spark")) {
    return "spark_sql";
  }
  if (lowerPrompt.includes("sql")) {
    return "sql";
  }
  return existingTransformation?.mode ?? "python";
}

function buildSuggestedTransformationCode(
  label: string,
  mode: NoodleDesignerTransformationMode,
  prompt: string
): string {
  const lowerPrompt = prompt.toLowerCase();
  if (mode === "sql" || mode === "spark_sql") {
    if (lowerPrompt.includes("dedup")) {
      return [
        `-- ${label}`,
        "WITH ranked_source AS (",
        "  SELECT",
        "    *,",
        "    ROW_NUMBER() OVER (PARTITION BY business_key ORDER BY event_time DESC) AS row_rank",
        "  FROM source_table",
        ")",
        "SELECT *",
        "FROM ranked_source",
        "WHERE row_rank = 1;"
      ].join("\n");
    }
    if (lowerPrompt.includes("filter") || lowerPrompt.includes("active")) {
      return [
        `-- ${label}`,
        "SELECT",
        "  *",
        "FROM source_table",
        "WHERE event_time >= CURRENT_DATE - INTERVAL '1 day'",
        "  AND COALESCE(status, 'unknown') <> 'deleted';"
      ].join("\n");
    }
    return [
      `-- ${label}`,
      "SELECT",
      "  business_key,",
      "  event_time,",
      "  UPPER(TRIM(source_name)) AS source_name,",
      "  payload",
      "FROM source_table",
      "WHERE event_time IS NOT NULL;"
    ].join("\n");
  }

  if (mode === "dbt") {
    return [
      `-- ${label}`,
      "{{ config(materialized='incremental', unique_key='business_key') }}",
      "",
      "with staged as (",
      "  select *",
      "  from {{ ref('source_table') }}",
      "  where event_time is not null",
      ")",
      "",
      "select",
      "  business_key,",
      "  event_time,",
      "  upper(trim(source_name)) as source_name,",
      "  payload",
      "from staged"
    ].join("\n");
  }

  if (lowerPrompt.includes("dedup")) {
    return [
      `# ${label}`,
      "def transform(records: list[dict]) -> list[dict]:",
      "    deduped: dict[str, dict] = {}",
      "    for record in records:",
      "        business_key = str(record.get('business_key') or '').strip()",
      "        if not business_key:",
      "            continue",
      "        current = deduped.get(business_key)",
      "        if current is None or str(record.get('event_time', '')) > str(current.get('event_time', '')):",
      "            deduped[business_key] = {**record, 'source_name': str(record.get('source_name', '')).strip().upper()}",
      "    return list(deduped.values())"
    ].join("\n");
  }

  if (lowerPrompt.includes("filter") || lowerPrompt.includes("active")) {
    return [
      `# ${label}`,
      "def transform(records: list[dict]) -> list[dict]:",
      "    output: list[dict] = []",
      "    for record in records:",
      "        if not record.get('event_time'):",
      "            continue",
      "        status = str(record.get('status', '')).lower()",
      "        if status == 'deleted':",
      "            continue",
      "        output.append({**record, 'source_name': str(record.get('source_name', '')).strip().upper()})",
      "    return output"
    ].join("\n");
  }

  return [
    `# ${label}`,
    "def transform(records: list[dict]) -> list[dict]:",
    "    output: list[dict] = []",
    "    for record in records:",
    "        if not record.get('event_time'):",
    "            continue",
    "        output.append({",
    "            **record,",
    "            'source_name': str(record.get('source_name', '')).strip().upper(),",
    "            'normalized_at': 'runtime'",
    "        })",
    "    return output"
  ].join("\n");
}

function buildSuggestedTransformationRecord(
  node: NoodleDesignerNode,
  prompt: string,
  existingTransformation?: NoodleDesignerTransformation | null
): NoodleDesignerTransformation {
  const mode = inferTransformationMode(prompt, existingTransformation);
  return {
    id: existingTransformation?.id ?? createId("transformation"),
    node_id: node.id,
    name: existingTransformation?.name ?? `${node.label} transformation`,
    plugin: existingTransformation?.plugin ?? "transform-plugin",
    mode,
    description:
      existingTransformation?.description ??
      `Generated by Agent Momo for ${node.label} from the current pipeline context.`,
    code: buildSuggestedTransformationCode(node.label, mode, prompt),
    config_json: JSON.stringify(
      {
        entrypoint: mode === "python" ? "transform" : "main",
        output_zone: "silver",
        expectations: ["event_time", "business_key"],
        observability: {
          lineage: true,
          metrics: ["rows_in", "rows_out", "latency_ms"]
        }
      },
      null,
      2
    ),
    tags: existingTransformation?.tags?.length ? existingTransformation.tags : ["transform", "momo-generated"]
  };
}

function shouldMaterializeTransformation(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  return (
    lowerPrompt.includes("create") ||
    lowerPrompt.includes("generate") ||
    lowerPrompt.includes("add") ||
    lowerPrompt.includes("write")
  ) && (
    lowerPrompt.includes("transform") ||
    lowerPrompt.includes("transformation")
  );
}

function isTransformationPrompt(prompt: string): boolean {
  const lowerPrompt = prompt.toLowerCase();
  return (
    lowerPrompt.includes("transform") ||
    lowerPrompt.includes("transformation") ||
    lowerPrompt.includes("mapping") ||
    lowerPrompt.includes("rule")
  );
}

function buildSourceGuidance(
  document: NoodlePipelineDesignerDocument,
  architectureSummary: string
): string {
  const sourceNodes = document.nodes.filter((node) => node.kind === "source");
  return `Source modeling: represent each upstream system as a source node plus a plugin-backed connection ref. Current graph has ${sourceNodes.length} source nodes and ${document.connection_refs.length} stored connections. Keep credentials in connection refs and keep source-specific runtime parameters on the source node only. ${architectureSummary}`;
}

function buildSchemaGuidance(
  document: NoodlePipelineDesignerDocument,
  sourceCount: number,
  architectureSummary: string
): string {
  return `Schema guidance: every source plugin should map to a stored schema entry and a downstream quality gate. This design currently stores ${document.schemas.length} schema definitions for ${sourceCount} source nodes. ${architectureSummary}`;
}

function buildTransformationGuidance(
  document: NoodlePipelineDesignerDocument,
  prompt: string,
  targetNode: NoodleDesignerNode | null,
  existingTransformation: NoodleDesignerTransformation | null,
  transformNodeCount: number,
  linkedTransformationCount: number,
  transformationIssues: NoodleDesignerValidation[]
): string {
  if (!targetNode) {
    return [
      `Transformation guidance: add a transform node first. Current graph has ${transformNodeCount} transform nodes and ${linkedTransformationCount} linked transformation records.`,
      transformationIssues.length
        ? `Current transformation issues: ${transformationIssues.map((item) => item.message).join(" | ")}.`
        : "Current transformation validation is clean."
    ].join(" ");
  }

  const suggestion = buildSuggestedTransformationRecord(targetNode, prompt, existingTransformation);
  return [
    `Transformation guidance: ${linkedTransformationCount}/${transformNodeCount} transform nodes currently have linked transformation records.`,
    `Suggested transformation for ${targetNode.label} (${suggestion.mode}):`,
    "Transformation Code:",
    "```" + suggestion.mode,
    suggestion.code,
    "```",
    "Config JSON:",
    "```json",
    suggestion.config_json,
    "```",
    transformationIssues.length
      ? `Current transformation issues to fix: ${transformationIssues.map((item) => item.message).join(" | ")}.`
      : "Current transformation validation is clean."
  ].join(" ");
}

function buildConnectionGuidance(
  document: NoodlePipelineDesignerDocument,
  architectureSummary: string
): string {
  return `Connection guidance: treat each external system as a plugin-backed connection reference, not a special case in task code. The repository currently stores ${document.connection_refs.length} connection references. ${architectureSummary}`;
}

function buildMetadataGuidance(
  document: NoodlePipelineDesignerDocument,
  architectureSummary: string
): string {
  return `Metadata guidance: persist repository metadata and emit lineage as first-class signals. Right now the repository stores ${document.metadata_assets.length} metadata assets, and you should keep quality and serving nodes wired so lineage remains clear. ${architectureSummary}`;
}

function buildScheduleGuidance(
  document: NoodlePipelineDesignerDocument,
  architectureSummary: string
): string {
  return `Scheduler guidance: keep scheduling in the control plane, let Apache Airflow orchestrate the DAG, and version the schedule with the pipeline. Current trigger is ${document.schedule.trigger} with concurrency policy ${document.schedule.concurrency_policy}. ${architectureSummary}`;
}

function buildDependencyGuidance(
  document: NoodlePipelineDesignerDocument
): string {
  return `Dependency guidance: keep source nodes at the graph edge, land them into ingest, and ensure every downstream node declares only the minimal upstream dependency set. Current graph has ${document.nodes.length} nodes and ${document.edges.length} edges. Cache should observe transformed output, quality should sit after transform or cache, and serve should depend on validated outputs.`;
}

function buildExecutionGuidance(architectureSummary: string): string {
  return `Execution-plane guidance: keep retries, worker dispatch, and task states out of the UI layer. Apache Airflow should orchestrate the DAG while workers own pending, queued, running, success, failed, retrying, skipped, and cancelled transitions. ${architectureSummary}`;
}

function buildNodeKindGuidance(
  node: NoodleDesignerNode,
  document: NoodlePipelineDesignerDocument,
  architectureSummary: string
): string {
  const upstreamCount = document.edges.filter((edge) => edge.target === node.id).length;
  const downstreamCount = document.edges.filter((edge) => edge.source === node.id).length;

  switch (node.kind) {
    case "source":
      return `${node.label} is a source node. Keep it plugin-backed, attach a repository connection reference, and avoid embedding credentials or source-specific special cases in runtime code. It currently has ${downstreamCount} downstream dependency${downstreamCount === 1 ? "" : "ies"}. ${architectureSummary}`;
    case "ingest":
      return `${node.label} is an ingest stage. Use it to land data durably, normalize handoff into the execution plane, and keep landing-zone or runner-specific params here instead of in downstream transforms. It currently fans in ${upstreamCount} upstream and fans out to ${downstreamCount} downstream stages. ${architectureSummary}`;
    case "transform":
      return `${node.label} is a transform stage. Link it to a reusable transformation record, keep the logic plugin-oriented, and version the config alongside the pipeline JSON. It currently has ${upstreamCount} upstream and ${downstreamCount} downstream dependencies. ${architectureSummary}`;
    case "cache":
      return `${node.label} is a cache stage. Use it after transform, quality, feature, or serve nodes to expose bounded previews without turning the cache into a source of truth. It currently observes ${upstreamCount} upstream and serves ${downstreamCount} downstream stages. ${architectureSummary}`;
    case "quality":
      return `${node.label} is a quality gate. Keep contracts, schema checks, and freshness or null validation here so publishable outputs are enforced before feature or serve stages. It currently protects ${downstreamCount} downstream stage${downstreamCount === 1 ? "" : "s"}. ${architectureSummary}`;
    case "feature":
      return `${node.label} is a feature materialization stage. Keep reusable feature outputs and ML-ready payloads here, after quality validation and before serving surfaces. It currently has ${upstreamCount} upstream dependencies. ${architectureSummary}`;
    case "serve":
      return `${node.label} is a serving stage. It should depend only on validated outputs and publish versioned datasets, APIs, or downstream artifacts instead of re-running business logic. It currently depends on ${upstreamCount} upstream stage${upstreamCount === 1 ? "" : "s"}. ${architectureSummary}`;
    default:
      return `${node.label} should stay aligned with the control-plane blueprint and use portable JSON plus plugin-backed behavior. ${architectureSummary}`;
  }
}

function buildRunGuidance(
  document: NoodlePipelineDesignerDocument,
  architectureSummary: string
): string {
  const latestRun = document.runs[0] ?? null;
  if (!latestRun) {
    return `Run guidance: no test runs have been recorded yet. Trigger a pipeline run to inspect task states, logs, cache previews, lineage, and repair behavior from the execution plane. ${architectureSummary}`;
  }

  return `Run guidance: the latest run is ${latestRun.label} with ${titleize(latestRun.status)} status, ${latestRun.task_runs.length} task runs, ${latestRun.logs.length} log entries, and ${latestRun.cached_outputs.length} cached output preview${latestRun.cached_outputs.length === 1 ? "" : "s"}. Use run review for repair planning, batch resume, and lineage validation. ${architectureSummary}`;
}

function buildReleaseGuidance(
  document: NoodlePipelineDesignerDocument,
  validationErrors: NoodleDesignerValidation[],
  architectureSummary: string
): string {
  if (validationErrors.length) {
    return `Release guidance: this workspace is blocked by ${validationErrors.length} validation issue${validationErrors.length === 1 ? "" : "s"}. Clear the blocking errors before publishing so the control plane, repository contracts, and execution DAG stay version-aligned. ${architectureSummary}`;
  }

  return `Release guidance: the graph is publishable from a dependency perspective. Keep the JSON pipeline, schedule, repository contracts, and deployment metadata versioned together when promoting release v${document.version}. ${architectureSummary}`;
}

function buildGeneralMomoGuidance(
  prompt: string,
  document: NoodlePipelineDesignerDocument,
  selectedNode: NoodleDesignerNode | null,
  architectureSummary: string,
  validationErrors: NoodleDesignerValidation[]
): string {
  const matchedNode =
    selectedNode ??
    document.nodes.find((node) => {
      const lowerPrompt = prompt.toLowerCase();
      return lowerPrompt.includes(node.label.toLowerCase()) || lowerPrompt.includes(node.kind);
    }) ??
    null;

  const validationSummary = validationErrors.length
    ? `There are ${validationErrors.length} blocking issue${validationErrors.length === 1 ? "" : "s"} to resolve before publish.`
    : "The current graph is publishable from a dependency perspective.";

  if (matchedNode) {
    return `For "${prompt.trim()}", the clearest current focus is ${matchedNode.label}. ${buildNodeKindGuidance(matchedNode, document, architectureSummary)} ${validationSummary}`;
  }

  return `For "${prompt.trim()}", I need a more specific design angle to give a sharp answer. I can help with sources, transforms, schemas, scheduling, dependencies, cache behavior, runs, deployment, or publishing. Right now the graph has ${document.nodes.length} nodes and ${document.edges.length} edges, and the repository stores ${document.connection_refs.length} connections, ${document.schemas.length} schemas, ${document.metadata_assets.length} metadata assets, and ${document.transformations.length} transformations. ${validationSummary} ${architectureSummary}`;
}

function buildBlueprintGuidance(
  overview: NoodleArchitectureOverview | null | undefined,
  principleSummary: string,
  architectureSummary: string,
  document: NoodlePipelineDesignerDocument,
  sourceCount: number,
  targetNode: NoodleDesignerNode | null,
  existingTransformation: NoodleDesignerTransformation | null,
  transformNodeCount: number,
  linkedTransformationCount: number,
  transformationIssues: NoodleDesignerValidation[],
  prompt: string
): string {
  return [
    `${overview?.objective ?? "The platform blueprint defines the target control-plane and execution-plane architecture for this designer."}`,
    `Apply ${principleSummary}.`,
    buildSourceGuidance(document, architectureSummary),
    buildMetadataGuidance(document, architectureSummary),
    buildScheduleGuidance(document, architectureSummary),
    buildDependencyGuidance(document),
    buildTransformationGuidance(
      document,
      prompt,
      targetNode,
      existingTransformation,
      transformNodeCount,
      linkedTransformationCount,
      transformationIssues
    ),
    buildSchemaGuidance(document, sourceCount, architectureSummary)
  ].join(" ");
}

function buildMomoReply(
  prompt: string,
  document: NoodlePipelineDesignerDocument,
  selectedNode?: NoodleDesignerNode | null,
  selectedTransformation?: NoodleDesignerTransformation | null,
  overview?: NoodleArchitectureOverview | null,
  principles: NoodleArchitecturePrinciple[] = [],
  validations: NoodleDesignerValidation[] = [],
  savedArchitecture?: SavedArchitectureDraft | null
) {
  const lowerPrompt = prompt.toLowerCase();
  const validationErrors = validations.filter((item) => item.level === "error");
  const transformationIssues = validations.filter((item) => item.id.startsWith("transformation-"));
  const sourceCount = document.nodes.filter((node) => node.kind === "source").length;
  const transformNodeCount = document.nodes.filter((node) => node.kind === "transform").length;
  const linkedTransformationCount = document.transformations.filter((item) => item.node_id).length;
  const architecturePlan = savedArchitecture?.plan as Record<string, unknown> | undefined;
  const architectureSummary =
    typeof architecturePlan?.summary === "string"
      ? architecturePlan.summary
      : savedArchitecture
        ? `Use the saved architecture "${savedArchitecture.name}" as the system reference.`
        : "Use the platform blueprint as the system reference.";
  const targetNode =
    selectedNode?.kind === "transform"
      ? selectedNode
      : document.nodes.find((node) => node.kind === "transform") ?? null;
  const existingForNode =
    selectedTransformation?.node_id === targetNode?.id
      ? selectedTransformation ?? null
      : targetNode
        ? document.transformations.find((item) => item.node_id === targetNode.id) ?? null
        : null;
  const principleSummary = principles.length
    ? principles.map((principle) => principle.title).join(", ")
    : "JSON specs, plugins, versioning, and observability";
  const sourceTopic = lowerPrompt.includes("source") || lowerPrompt.includes("plugin-backed");
  const metadataTopic = lowerPrompt.includes("metadata") || lowerPrompt.includes("lineage");
  const scheduleTopic = lowerPrompt.includes("schedule") || lowerPrompt.includes("cron");
  const dependencyTopic = lowerPrompt.includes("dependenc") || lowerPrompt.includes("dag") || lowerPrompt.includes("task");
  const schemaTopic = lowerPrompt.includes("schema");
  const connectionTopic = lowerPrompt.includes("connection") || lowerPrompt.includes("connector");
  const transformTopic =
    lowerPrompt.includes("transform") ||
    lowerPrompt.includes("transformation") ||
    lowerPrompt.includes("mapping") ||
    lowerPrompt.includes("rule");
  const executionTopic = lowerPrompt.includes("retry") || lowerPrompt.includes("worker") || lowerPrompt.includes("execution");
  const runTopic =
    lowerPrompt.includes("run") ||
    lowerPrompt.includes("log") ||
    lowerPrompt.includes("cache") ||
    lowerPrompt.includes("batch") ||
    lowerPrompt.includes("repair");
  const releaseTopic =
    lowerPrompt.includes("publish") ||
    lowerPrompt.includes("release") ||
    lowerPrompt.includes("deploy") ||
    lowerPrompt.includes("deployment") ||
    lowerPrompt.includes("version");
  const blueprintTopic = lowerPrompt.includes("blueprint") || lowerPrompt.includes("platform blueprint");
  const kindMentionedNode =
    selectedNode ??
    document.nodes.find((node) => lowerPrompt.includes(node.kind) || lowerPrompt.includes(node.label.toLowerCase())) ??
    null;
  const multiTopicCount = [
    sourceTopic,
    metadataTopic,
    scheduleTopic,
    dependencyTopic,
    schemaTopic,
    connectionTopic,
    transformTopic,
    executionTopic,
    runTopic,
    releaseTopic,
    blueprintTopic
  ].filter(Boolean).length;
  const wantsCompositeGuidance =
    blueprintTopic ||
    multiTopicCount >= 3 ||
    ((lowerPrompt.includes("how should i") || lowerPrompt.includes("how do i model") || lowerPrompt.includes("what should i do")) &&
      multiTopicCount >= 2);

  if (lowerPrompt.includes("schedule")) {
    return buildScheduleGuidance(document, architectureSummary);
  }
  if (lowerPrompt.includes("schema")) {
    return buildSchemaGuidance(document, sourceCount, architectureSummary);
  }
  if (
    lowerPrompt.includes("transform") ||
    lowerPrompt.includes("transformation") ||
    lowerPrompt.includes("mapping") ||
    lowerPrompt.includes("rule")
  ) {
    return buildTransformationGuidance(
      document,
      prompt,
      targetNode,
      existingForNode,
      transformNodeCount,
      linkedTransformationCount,
      transformationIssues
    );
  }
  if (lowerPrompt.includes("connection")) {
    return buildConnectionGuidance(document, architectureSummary);
  }
  if (lowerPrompt.includes("metadata") || lowerPrompt.includes("lineage")) {
    return buildMetadataGuidance(document, architectureSummary);
  }
  if (lowerPrompt.includes("retry") || lowerPrompt.includes("worker") || lowerPrompt.includes("execution")) {
    return buildExecutionGuidance(architectureSummary);
  }
  if (runTopic) {
    return buildRunGuidance(document, architectureSummary);
  }
  if (releaseTopic) {
    return buildReleaseGuidance(document, validationErrors, architectureSummary);
  }
  if (kindMentionedNode) {
    return buildNodeKindGuidance(kindMentionedNode, document, architectureSummary);
  }
  if (wantsCompositeGuidance) {
    return buildBlueprintGuidance(
      overview,
      principleSummary,
      architectureSummary,
      document,
      sourceCount,
      targetNode,
      existingForNode,
      transformNodeCount,
      linkedTransformationCount,
      transformationIssues,
      prompt
    );
  }

  return buildGeneralMomoGuidance(prompt, document, selectedNode ?? null, architectureSummary, validationErrors);
}

const DesignerNodeCard = ({ data }: NodeProps<DesignerNodeData>) => {
  const colors = NODE_COLORS[data.kind];
  const nodeLabel = data.kind === "cache" ? "Cache Node" : titleize(data.kind);

  return (
    <>
      {NODE_CONNECTOR_POSITIONS.map((top, index) => (
        <Handle
          key={`target-${index}`}
          id={`target-${index}`}
          type="target"
          position={Position.Left}
          data-testid={`node-target-handle-${index}`}
          style={{ top: `${top}%`, background: colors.stroke, border: "2px solid #ffffff", width: 10, height: 10, left: -6 }}
        />
      ))}
      <Box
        data-testid={`designer-node-${data.id}`}
        sx={{
          width: 236,
          minHeight: 128,
          borderRadius: 4,
          border: data.selected ? "2px solid #112f5f" : `1px solid ${alpha(colors.stroke, 0.75)}`,
          background: `linear-gradient(180deg, ${alpha("#ffffff", 0.96)} 0%, ${alpha(colors.fill, 0.88)} 100%)`,
          px: 2,
          py: 1.7,
          position: "relative",
          overflow: "hidden",
          boxShadow: data.selected ? "0 24px 44px rgba(17, 47, 95, 0.24)" : "0 14px 30px rgba(15, 23, 42, 0.10)",
          "&::before": {
            content: '""',
            position: "absolute",
            inset: "0 auto 0 0",
            width: 6,
            background: `linear-gradient(180deg, ${colors.stroke} 0%, ${alpha(colors.accent, 0.72)} 100%)`
          },
          "&::after": {
            content: '""',
            position: "absolute",
            top: -34,
            right: -30,
            width: 108,
            height: 108,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${alpha(colors.stroke, 0.18)} 0%, rgba(255,255,255,0) 74%)`
          }
        }}
      >
        <Stack spacing={1.25} sx={{ position: "relative", zIndex: 1 }}>
          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
            <Chip
              size="small"
              label={nodeLabel}
              sx={{
                height: 24,
                bgcolor: alpha(colors.stroke, 0.14),
                color: colors.accent,
                fontWeight: 800,
                borderRadius: 999
              }}
            />
            <Box
              sx={{
                minWidth: 30,
                height: 30,
                px: 0.8,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                bgcolor: alpha(colors.stroke, 0.12),
                color: colors.accent,
                fontSize: "0.72rem",
                fontWeight: 900,
                letterSpacing: "0.08em"
              }}
            >
              {data.kind.slice(0, 3).toUpperCase()}
            </Box>
          </Stack>
          <Typography sx={{ fontWeight: 800, color: "#17315c", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
            {data.label}
          </Typography>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label={`${data.paramCount} param${data.paramCount === 1 ? "" : "s"}`}
              sx={{ height: 24, bgcolor: "rgba(255,255,255,0.82)", color: "#34506f", fontWeight: 700 }}
            />
            {data.hasTransformation ? (
              <Chip
                size="small"
                label="Linked transform"
                sx={{ height: 24, bgcolor: alpha("#2e7d32", 0.12), color: "#1f5f24", fontWeight: 700 }}
              />
            ) : null}
            {data.kind === "cache" ? (
              <Chip
                size="small"
                label="30 MB preview"
                sx={{ height: 24, bgcolor: alpha("#ed6c02", 0.12), color: "#8a4700", fontWeight: 700 }}
              />
            ) : null}
          </Stack>
        </Stack>
      </Box>
      {NODE_CONNECTOR_POSITIONS.map((top, index) => (
        <Handle
          key={`source-${index}`}
          id={`source-${index}`}
          type="source"
          position={Position.Right}
          data-testid={`node-source-handle-${index}`}
          style={{ top: `${top}%`, background: colors.stroke, border: "2px solid #ffffff", width: 10, height: 10, right: -6 }}
        />
      ))}
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
  agentMomoBrief: _agentMomoBrief,
  deploymentSeed,
  seedDocument,
  plannedOrchestratorPlan
}: NoodlePipelineDesignerProps) {
  const [document, setDocument] = useState<NoodlePipelineDesignerDocument>(() =>
    seedDocument
      ? normalizeDocument(seedDocument, intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan)
      : buildSeedDocument(intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan)
  );
  const [savedDocuments, setSavedDocuments] = useState<NoodlePipelineDesignerDocument[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedMetadataId, setSelectedMetadataId] = useState<string | null>(null);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [selectedTransformationId, setSelectedTransformationId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedBatchSessionId, setSelectedBatchSessionId] = useState<string | null>(null);
  const [repairMode, setRepairMode] = useState<NoodleDesignerRepairMode>("best_effort");
  const [repairScope, setRepairScope] = useState<NoodleDesignerRepairScope>("failed_and_dependents");
  const [repairReason, setRepairReason] = useState("");
  const [selectedRepairTaskIds, setSelectedRepairTaskIds] = useState<string[]>([]);
  const [batchResumeMode, setBatchResumeMode] = useState<NoodleDesignerRepairMode>("best_effort");
  const [batchResumeReason, setBatchResumeReason] = useState("");
  const [batchResumeOffset, setBatchResumeOffset] = useState("");
  const [cachedOutputViewMode, setCachedOutputViewMode] = useState<"preview" | "table">("preview");
  const [activeTab, setActiveTab] = useState<(typeof RUN_TABS)[number]>("builder");
  const [repositorySection, setRepositorySection] = useState<(typeof REPOSITORY_SECTIONS)[number]>("palette");
  const [logFilter, setLogFilter] = useState<NoodleDesignerLogLevel | "all">("all");
  const [momoPrompt, setMomoPrompt] = useState("");
  const [momoSuggestion, setMomoSuggestion] = useState<MomoTransformationSuggestion | null>(null);
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
  const [runNotice, setRunNotice] = useState<DesignerNotice | null>(null);
  const runNotificationSnapshotRef = useRef<Map<string, NoodleDesignerRun["status"]>>(new Map());
  const runNotificationInitializedRef = useRef(false);
  const [momoMessages, setMomoMessages] = useState<MomoMessage[]>([
    {
      id: createId("momo"),
      role: "assistant",
      content: buildMomoWelcome(architectureOverview, designPrinciples, savedArchitecture)
    }
  ]);

  useEffect(() => {
    const draft = loadNoodlePipelineDraft();
    const history = loadSavedNoodlePipelines().map((entry) =>
      normalizeDocument(entry, intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan)
    );
    setSavedDocuments(history);
    if (seedDocument) {
      setDocument(normalizeDocument(seedDocument, intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan));
    } else if (!preferIntentSeed && draft) {
      setDocument(normalizeDocument(draft, intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan));
    } else {
      setDocument(buildSeedDocument(intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan));
    }
    setHydrated(true);
  }, [deploymentSeed, intentName, plannedOrchestratorPlan, preferIntentSeed, seedDocument, sources, workflowTemplate]);

  useEffect(() => {
    let active = true;

    async function hydrateRemote() {
      try {
        const remoteDocuments = (await listNoodlePipelines()).map((entry) =>
          normalizeDocument(entry, intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan)
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
  }, [deploymentSeed, document.id, intentName, plannedOrchestratorPlan, preferIntentSeed, seedDocument, sources, workflowTemplate]);

  useEffect(() => {
    setMomoMessages([
      {
        id: createId("momo"),
        role: "assistant",
        content: buildMomoWelcome(architectureOverview, designPrinciples, savedArchitecture)
      }
    ]);
  }, [architectureOverview, designPrinciples, savedArchitecture]);

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
  const selectedRun = useMemo(() => document.runs.find((run) => run.id === selectedRunId) ?? null, [document.runs, selectedRunId]);
  const selectedBatchSession = useMemo(
    () => document.batch_sessions?.find((session) => session.id === selectedBatchSessionId) ?? null,
    [document.batch_sessions, selectedBatchSessionId]
  );
  const selectedRunFailedTaskIds = useMemo(
    () =>
      selectedRun?.task_runs
        .filter((task) => task.state === "failed" || task.state === "skipped" || task.state === "cancelled")
        .map((task) => task.node_id) ?? [],
    [selectedRun]
  );
  const selectedRunRepairable = selectedRun ? selectedRun.status === "failed" || selectedRun.status === "cancelled" : false;
  const selectedRunBatchSessions = useMemo(
    () =>
      selectedRun
        ? (document.batch_sessions ?? []).filter(
            (session) =>
              (selectedRun.batch_session_ids ?? []).includes(session.id) ||
              session.last_run_id === selectedRun.id ||
              session.related_run_ids.includes(selectedRun.id)
          )
        : document.batch_sessions ?? [],
    [document.batch_sessions, selectedRun]
  );
  const selectedRunCachedOutputs = useMemo(
    () =>
      selectedRun
        ? selectedNode?.kind === "cache"
        ? selectedRun.cached_outputs.filter((item) => item.node_id === selectedNode.id)
          : selectedRun.cached_outputs
        : [],
    [selectedNode, selectedRun]
  );
  const latestCachedOutputForSelectedNode = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== "cache") {
      return null;
    }

    for (const run of document.runs) {
      const matchedOutput = run.cached_outputs.find((item) => item.node_id === selectedNode.id);
      if (matchedOutput) {
        return { runLabel: run.label, output: matchedOutput };
      }
    }
    return null;
  }, [document.runs, selectedNode]);

  const flowNodes = useMemo<FlowNode<DesignerNodeData>[]>(
    () =>
      document.nodes.map((node) => ({
        id: node.id,
        type: "designer",
        position: node.position,
        draggable: true,
        data: {
          id: node.id,
          label: node.label,
          kind: node.kind,
          selected: node.id === selectedNodeId,
          paramCount: node.params.length,
          hasTransformation: document.transformations.some((item) => item.node_id === node.id)
        }
      })),
    [document.nodes, document.transformations, selectedNodeId]
  );

  const flowEdges = useMemo<FlowEdge[]>(
    () => {
      const outgoingCounts = new Map<string, number>();
      const incomingCounts = new Map<string, number>();

      return document.edges.map((edge) => {
        const sourceCount = outgoingCounts.get(edge.source) ?? 0;
        const targetCount = incomingCounts.get(edge.target) ?? 0;
        outgoingCounts.set(edge.source, sourceCount + 1);
        incomingCounts.set(edge.target, targetCount + 1);

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: `source-${sourceCount % NODE_CONNECTOR_POSITIONS.length}`,
          targetHandle: `target-${targetCount % NODE_CONNECTOR_POSITIONS.length}`,
          type: "smoothstep",
          selected: edge.id === selectedEdgeId,
          markerEnd: { type: MarkerType.ArrowClosed, color: edge.id === selectedEdgeId ? "#0f172a" : "#316fd6" },
          style: { stroke: edge.id === selectedEdgeId ? "#0f172a" : "#316fd6", strokeWidth: edge.id === selectedEdgeId ? 3.5 : 2.5 }
        };
      });
    },
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
      normalizeDocument(updater(current), intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan)
    );
  }, [deploymentSeed, intentName, plannedOrchestratorPlan, sources, workflowTemplate]);

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
        deploymentSeed,
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
  }, [deploymentSeed, document, intentName, nextVersion, plannedOrchestratorPlan, savedDocuments, sources, workflowTemplate]);

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
      const normalized = normalizeDocument(parsed, intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan);
      setDocument(normalized);
      setRawSpecText(JSON.stringify(normalized, null, 2));
      setRawSpecDirty(false);
      setRawSpecError(null);
      setSyncError(null);
    } catch (error) {
      setRawSpecError(error instanceof Error ? error.message : "Invalid JSON pipeline spec.");
    }
  }, [deploymentSeed, intentName, plannedOrchestratorPlan, rawSpecText, sources, workflowTemplate]);

  const resetRawSpec = useCallback(() => {
    setRawSpecText(JSON.stringify(document, null, 2));
    setRawSpecDirty(false);
    setRawSpecError(null);
  }, [document]);

  const copyRawSpec = useCallback(async () => {
    if (!rawSpecText.trim()) {
      setNotice({
        id: createId("notice"),
        severity: "info",
        message: "Nothing to copy from the pipeline JSON editor."
      });
      return;
    }

    const copied = await copyTextToClipboard(rawSpecText);
    setNotice({
      id: createId("notice"),
      severity: copied ? "success" : "warning",
      message: copied ? "Pipeline JSON copied." : "Clipboard copy failed in this environment."
    });
  }, [rawSpecText]);

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
    if (!selectedRun) {
      if (selectedRepairTaskIds.length) {
        setSelectedRepairTaskIds([]);
      }
      return;
    }
    if (repairScope === "selected" || repairScope === "selected_and_dependents") {
      const availableTaskIds = new Set(selectedRun.task_runs.map((task) => task.node_id));
      const retainedIds = selectedRepairTaskIds.filter((taskId) => availableTaskIds.has(taskId));
      if (retainedIds.length !== selectedRepairTaskIds.length) {
        setSelectedRepairTaskIds(retainedIds);
      }
      return;
    }
    const nextTaskIds = selectedRunFailedTaskIds;
    if (
      nextTaskIds.length !== selectedRepairTaskIds.length ||
      nextTaskIds.some((taskId, index) => taskId !== selectedRepairTaskIds[index])
    ) {
      setSelectedRepairTaskIds(nextTaskIds);
    }
  }, [repairScope, selectedRepairTaskIds, selectedRun, selectedRunFailedTaskIds]);

  useEffect(() => {
    if (!document.batch_sessions?.length) {
      if (selectedBatchSessionId) {
        setSelectedBatchSessionId(null);
      }
      return;
    }

    const preferredSession =
      selectedRunBatchSessions[0] ??
      (selectedBatchSessionId ? document.batch_sessions.find((session) => session.id === selectedBatchSessionId) ?? null : null) ??
      document.batch_sessions[0];

    if (preferredSession && preferredSession.id !== selectedBatchSessionId) {
      setSelectedBatchSessionId(preferredSession.id);
    }
  }, [document.batch_sessions, selectedBatchSessionId, selectedRunBatchSessions]);

  useEffect(() => {
    if (!selectedBatchSession) {
      if (batchResumeOffset) {
        setBatchResumeOffset("");
      }
      return;
    }
    const suggestedOffset = String(selectedBatchSession.next_offset);
    if (!batchResumeOffset || batchResumeOffset === "0") {
      setBatchResumeOffset(suggestedOffset);
    }
  }, [batchResumeOffset, selectedBatchSession]);

  useEffect(() => {
    const previousSnapshot = runNotificationSnapshotRef.current;
    const nextSnapshot = new Map<string, NoodleDesignerRun["status"]>();
    for (const run of document.runs) {
      nextSnapshot.set(run.id, run.status);
    }

    if (!runNotificationInitializedRef.current) {
      runNotificationSnapshotRef.current = nextSnapshot;
      runNotificationInitializedRef.current = true;
      return;
    }

    const changedRun =
      document.runs.find((run) => !previousSnapshot.has(run.id) || previousSnapshot.get(run.id) !== run.status) ?? null;

    if (changedRun) {
      setRunNotice({
        id: createId("run-notice"),
        severity: changedRun.status === "failed" || changedRun.status === "cancelled" ? "warning" : changedRun.status === "success" ? "success" : "info",
        message: `${changedRun.label} ${titleize(changedRun.status)} at ${new Date(changedRun.started_at).toLocaleTimeString()}.`
      });
    }

    runNotificationSnapshotRef.current = nextSnapshot;
  }, [document.runs]);

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

  const applyMomoSuggestion = useCallback(() => {
    if (!momoSuggestion) {
      return;
    }

    updateDocument((current) => {
      const existingIndex = current.transformations.findIndex((item) => item.node_id === momoSuggestion.targetNodeId);
      if (existingIndex >= 0) {
        return {
          ...current,
          transformations: current.transformations.map((item, index) =>
            index === existingIndex ? momoSuggestion.transformation : item
          )
        };
      }
      return {
        ...current,
        transformations: [...current.transformations, momoSuggestion.transformation]
      };
    });
    setSelectedNodeId(momoSuggestion.targetNodeId);
    setSelectedTransformationId(momoSuggestion.transformation.id);
    setRepositorySection("transformations");
    setNotice({
      id: createId("notice"),
      severity: "success",
      message: `${momoSuggestion.targetNodeLabel} transformation was applied from Agent Momo's suggestion.`
    });
    setMomoSuggestion(null);
  }, [momoSuggestion, updateDocument]);

  const sendMomoMessage = useCallback(() => {
    const prompt = momoPrompt.trim();
    if (!prompt) {
      return;
    }
    const targetTransformNode =
      selectedNode?.kind === "transform"
        ? selectedNode
        : document.nodes.find((node) => node.kind === "transform") ?? null;
    const existingTransformationForNode =
      selectedNodeTransformation?.node_id === targetTransformNode?.id
        ? selectedNodeTransformation
        : targetTransformNode
          ? document.transformations.find((item) => item.node_id === targetTransformNode.id) ?? null
          : null;
    const shouldStageTransformationSuggestion =
      Boolean(targetTransformNode) &&
      isTransformationPrompt(prompt) &&
      shouldMaterializeTransformation(prompt);
    if (shouldStageTransformationSuggestion && targetTransformNode) {
      const nextTransformation = buildSuggestedTransformationRecord(
        targetTransformNode,
        prompt,
        existingTransformationForNode
      );
      setMomoSuggestion({
        transformation: nextTransformation,
        targetNodeId: targetTransformNode.id,
        targetNodeLabel: targetTransformNode.label,
        replacesExisting: Boolean(existingTransformationForNode)
      });
    } else if (!isTransformationPrompt(prompt)) {
      setMomoSuggestion(null);
    }
    const userMessage: MomoMessage = { id: createId("momo"), role: "user", content: prompt };
    const reply: MomoMessage = {
      id: createId("momo"),
      role: "assistant",
      content:
        buildMomoReply(
          prompt,
          document,
          selectedNode,
          selectedTransformation ?? selectedNodeTransformation ?? existingTransformationForNode,
          architectureOverview,
          designPrinciples,
          validations,
          savedArchitecture
        ) +
        (shouldStageTransformationSuggestion && targetTransformNode
          ? ` A suggested transformation for ${targetTransformNode.label} is ready below. Review it and click Apply Suggestion to add it to the pipeline.`
          : "")
    };
    setMomoMessages((current) => [...current, userMessage, reply]);
    setMomoPrompt("");
  }, [
    architectureOverview,
    designPrinciples,
    document,
    momoPrompt,
    savedArchitecture,
    selectedNode,
    selectedTransformation,
    selectedNodeTransformation,
    validations
  ]);

  const triggerRun = useCallback(async () => {
    const now = new Date().toISOString();
    const hasBlockingErrors = validationErrors.length > 0;
    setRemoteBusy(true);
    try {
      const response = await createNoodlePipelineRun(document.id, {
        trigger: "manual",
        orchestration_mode: document.schedule.orchestration_mode,
        document
      });
      const persisted = normalizeDocument(response.pipeline, intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan);
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
      const message = error instanceof Error ? error.message : "Run request failed.";
      const isConnectivityError =
        message.includes("Could not reach the local frontend API proxy") ||
        message.includes("Could not reach the API at");
      if (!isConnectivityError) {
        setSyncError(message);
        setNotice({
          id: createId("notice"),
          severity: "warning",
          message
        });
        return;
      }

      const nextRun: NoodleDesignerRun = {
        id: createId("run"),
        label: hasBlockingErrors ? "Manual debug run" : "Manual Airflow run",
        orchestrator: "Apache Airflow",
        status: hasBlockingErrors ? "failed" : "running",
        trigger: "manual",
        orchestration_mode: document.schedule.orchestration_mode,
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
        ],
        cached_outputs: buildCachedOutputs(document.nodes, document.edges, document.transformations)
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
  }, [deploymentSeed, document, intentName, plannedOrchestratorPlan, sources, updateDocument, validationErrors, workflowTemplate]);

  const toggleRepairTask = useCallback((taskId: string) => {
    setSelectedRepairTaskIds((current) =>
      current.includes(taskId) ? current.filter((entry) => entry !== taskId) : [...current, taskId]
    );
  }, []);

  const repairRun = useCallback(async () => {
    if (!selectedRun) {
      setNotice({
        id: createId("notice"),
        severity: "warning",
        message: "Select a failed or cancelled run before starting a repair."
      });
      return;
    }
    if (!selectedRunRepairable) {
      setNotice({
        id: createId("notice"),
        severity: "info",
        message: "Repair is currently available only for failed or cancelled runs."
      });
      return;
    }
    if ((repairScope === "selected" || repairScope === "selected_and_dependents") && selectedRepairTaskIds.length === 0) {
      setNotice({
        id: createId("notice"),
        severity: "warning",
        message: "Select at least one task for a selected-task repair."
      });
      return;
    }

    setRemoteBusy(true);
    try {
      const response = await createNoodlePipelineRepairRun(document.id, selectedRun.id, {
        repair_scope: repairScope,
        repair_mode: repairMode,
        task_ids: selectedRepairTaskIds,
        reason: repairReason.trim(),
        orchestration_mode: document.schedule.orchestration_mode,
        document
      });
      const persisted = normalizeDocument(response.pipeline, intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan);
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
      const message = error instanceof Error ? error.message : "Repair request failed.";
      const isConnectivityError =
        message.includes("Could not reach the local frontend API proxy") ||
        message.includes("Could not reach the API at");
      if (!isConnectivityError) {
        setSyncError(message);
        setNotice({
          id: createId("notice"),
          severity: "warning",
          message
        });
        return;
      }

      const rerunTaskIds =
        repairScope === "selected" || repairScope === "selected_and_dependents"
          ? selectedRepairTaskIds
          : selectedRunFailedTaskIds;
      const nextRun: NoodleDesignerRun = {
        id: createId("run"),
        label: `Repair ${(selectedRun.repair_attempt ?? 0) + 1} for ${selectedRun.label}`,
        orchestrator: "Apache Airflow",
        status: "success",
        trigger: "manual",
        orchestration_mode: document.schedule.orchestration_mode,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        document_version: document.version,
        root_run_id: selectedRun.root_run_id ?? selectedRun.id,
        repair_of_run_id: selectedRun.id,
        repair_attempt: (selectedRun.repair_attempt ?? 0) + 1,
        repair_attempt_id: `${selectedRun.root_run_id ?? selectedRun.id}:repair-${(selectedRun.repair_attempt ?? 0) + 1}`,
        repair_scope: repairScope,
        repair_mode: repairMode,
        repair_outcome: repairMode === "exact" ? "blocked" : "best_effort",
        repair_reason: repairReason.trim() || null,
        repaired_task_ids: rerunTaskIds,
        reused_task_ids: selectedRun.task_runs
          .filter((task) => !rerunTaskIds.includes(task.node_id))
          .map((task) => task.node_id),
        repair_plan: {
          attempt_id: `${selectedRun.root_run_id ?? selectedRun.id}:repair-${(selectedRun.repair_attempt ?? 0) + 1}`,
          base_run_id: selectedRun.id,
          root_run_id: selectedRun.root_run_id ?? selectedRun.id,
          document_version: document.version,
          mode: repairMode,
          outcome: repairMode === "exact" ? "blocked" : "best_effort",
          scope: repairScope,
          rerun_task_ids: rerunTaskIds,
          reused_task_ids: selectedRun.task_runs
            .filter((task) => !rerunTaskIds.includes(task.node_id))
            .map((task) => task.node_id),
          downstream_task_ids: [],
          validation_issues: [
            {
              severity: repairMode === "exact" ? "error" : "warn",
              code: isConnectivityError ? "repair_service_unavailable" : "repair_request_failed",
              message: `${message} Repair was simulated locally only.`
            }
          ]
        },
        task_runs: selectedRun.task_runs.map((task) => ({
          id: createId("task-run"),
          node_id: task.node_id,
          node_label: task.node_label,
          state: rerunTaskIds.includes(task.node_id) ? "success" : "reused",
          started_at: rerunTaskIds.includes(task.node_id) ? new Date().toISOString() : task.started_at,
          finished_at: new Date().toISOString()
        })),
        logs: [
          createRunLogs("Repair run", "log", `Repair created from ${selectedRun.label}.`),
          createRunLogs("Repair run", "info", `Repair scope ${repairScope.replaceAll("_", " ")} targeted ${rerunTaskIds.length} tasks in ${repairMode.replaceAll("_", " ")} mode.`),
          createRunLogs(
            "Repair run",
            "warn",
            `${message} Repair was simulated locally only.`
          )
        ],
        cached_outputs: selectedRun.cached_outputs,
        sink_bindings: [],
        lineage_records: []
      };
      updateDocument((current) => ({
        ...current,
        runs: [nextRun, ...current.runs]
      }));
      setSelectedRunId(nextRun.id);
      setActiveTab("runs");
      setSyncError(
        error instanceof Error
          ? `${error.message} Repair run was simulated locally only.`
          : "Repair service unavailable; repair was simulated locally only."
      );
      setNotice({
        id: createId("notice"),
        severity: "info",
        message: "Repair service was unavailable, so the repair was simulated locally."
      });
    } finally {
      setRemoteBusy(false);
    }
  }, [
    deploymentSeed,
    document,
    intentName,
    plannedOrchestratorPlan,
    repairMode,
    repairReason,
    repairScope,
    selectedRepairTaskIds,
    selectedRun,
    selectedRunFailedTaskIds,
    selectedRunRepairable,
    sources,
    updateDocument,
    workflowTemplate
  ]);

  const resumeBatchSession = useCallback(async () => {
    if (!selectedBatchSession) {
      setNotice({
        id: createId("notice"),
        severity: "warning",
        message: "Select a batch session before starting a resume."
      });
      return;
    }

    const parsedOffset = batchResumeOffset.trim() ? Number(batchResumeOffset) : selectedBatchSession.next_offset;
    if (!Number.isFinite(parsedOffset) || parsedOffset < 1) {
      setNotice({
        id: createId("notice"),
        severity: "warning",
        message: "Resume offset must be a positive integer."
      });
      return;
    }

    setRemoteBusy(true);
    try {
      const response = await resumeNoodlePipelineBatchSession(document.id, selectedBatchSession.id, {
        mode: batchResumeMode,
        from_offset: parsedOffset,
        reason: batchResumeReason.trim(),
        document
      });
      const persisted = normalizeDocument(response.pipeline, intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan);
      setDocument(persisted);
      setSavedDocuments((current) => {
        const nextDocuments = mergeSavedNoodlePipelines(current, persisted);
        storeSavedNoodlePipelines(nextDocuments);
        return nextDocuments;
      });
      setSelectedRunId(response.run.id);
      setSelectedBatchSessionId(response.batch_session.id);
      setBatchResumeOffset(String(response.batch_session.next_offset));
      setSyncError(null);
      setNotice({
        id: createId("notice"),
        severity: response.run.status === "failed" ? "warning" : "success",
        message: `${response.run.label} is ${titleize(response.run.status)}.`
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Batch resume request failed.";
      const isConnectivityError =
        message.includes("Could not reach the local frontend API proxy") ||
        message.includes("Could not reach the API at");
      if (!isConnectivityError) {
        setSyncError(message);
        setNotice({
          id: createId("notice"),
          severity: "warning",
          message
        });
        return;
      }

      const runId = createId("run");
      const rootRunId = selectedBatchSession.root_run_id ?? selectedRun?.root_run_id ?? runId;
      const blocked = batchResumeMode === "exact" && !selectedBatchSession.exact_supported;
      const committed = !blocked;
      const nextSession: NoodleDesignerBatchSession = {
        ...selectedBatchSession,
        staged_count: committed ? selectedBatchSession.expected_count : selectedBatchSession.staged_count,
        committed_count: committed ? selectedBatchSession.expected_count : selectedBatchSession.committed_count,
        next_offset: committed ? selectedBatchSession.expected_count + 1 : selectedBatchSession.next_offset,
        max_contiguous_committed_offset: committed ? selectedBatchSession.expected_count : selectedBatchSession.max_contiguous_committed_offset,
        status: committed ? "committed" : selectedBatchSession.status,
        committed_version: committed ? `v${document.version}:${rootRunId}:local-resume:${selectedBatchSession.source_node_id}` : selectedBatchSession.committed_version,
        last_run_id: runId,
        root_run_id: rootRunId,
        related_run_ids: [...selectedBatchSession.related_run_ids, runId],
        resume_token: {
          ...selectedBatchSession.resume_token,
          next_offset: committed ? selectedBatchSession.expected_count + 1 : selectedBatchSession.next_offset,
          last_committed_at: committed ? new Date().toISOString() : selectedBatchSession.resume_token.last_committed_at
        },
        attempts: [
          ...selectedBatchSession.attempts,
          {
            id: createId("batch-attempt"),
            run_id: runId,
            kind: "resume",
            mode: batchResumeMode,
            status: blocked ? "blocked" : "committed",
            from_offset: parsedOffset,
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            staged_count: committed ? selectedBatchSession.expected_count : selectedBatchSession.staged_count,
            next_offset: committed ? selectedBatchSession.expected_count + 1 : selectedBatchSession.next_offset,
            committed_version: committed ? `v${document.version}:${rootRunId}:local-resume:${selectedBatchSession.source_node_id}` : null,
            reason: `${batchResumeReason.trim() || "Connectivity fallback."} Resume was simulated locally only.`
          }
        ]
      };
      const nextRun: NoodleDesignerRun = {
        id: runId,
        label: `Resume batch ${selectedBatchSession.source_batch_id}`,
        orchestrator: "Apache Airflow",
        status: blocked ? "failed" : "success",
        trigger: "manual",
        orchestration_mode: selectedRun?.orchestration_mode ?? document.schedule.orchestration_mode,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        document_version: document.version,
        root_run_id: rootRunId,
        repair_attempt_id: `${rootRunId}:local-resume`,
        repair_mode: batchResumeMode,
        repair_outcome: blocked ? "blocked" : batchResumeMode,
        repair_reason: batchResumeReason.trim() || null,
        batch_session_ids: [selectedBatchSession.id],
        task_runs: (selectedRun?.task_runs ?? []).map((task) => ({
          id: createId("task-run"),
          node_id: task.node_id,
          node_label: task.node_label,
          state:
            task.node_id === selectedBatchSession.source_node_id
              ? blocked
                ? "failed"
                : "success"
              : (selectedRun?.task_runs.some((runTask) => runTask.node_id === selectedBatchSession.source_node_id) ?? false)
                ? "reused"
                : task.state,
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString()
        })),
        logs: [
          createRunLogs("Batch resume", "log", `Resume created for ${selectedBatchSession.source_batch_id} from offset ${parsedOffset}.`),
          createRunLogs(
            "Batch resume",
            blocked ? "warn" : "info",
            blocked
              ? `${message} Exact resume remained blocked because the selected batch session is not exact-capable.`
              : `${message} Resume was simulated locally only.`
          )
        ],
        cached_outputs: [],
        sink_bindings: selectedRun?.sink_bindings ?? [],
        lineage_records: selectedRun?.lineage_records ?? []
      };
      updateDocument((current) => ({
        ...current,
        batch_sessions: (current.batch_sessions ?? []).map((session) => (session.id === nextSession.id ? nextSession : session)),
        runs: [nextRun, ...current.runs]
      }));
      setSelectedRunId(nextRun.id);
      setSelectedBatchSessionId(nextSession.id);
      setBatchResumeOffset(String(nextSession.next_offset));
      setSyncError(
        blocked
          ? `${message} Exact resume stayed blocked in local fallback mode.`
          : `${message} Batch resume was simulated locally only.`
      );
      setNotice({
        id: createId("notice"),
        severity: blocked ? "warning" : "info",
        message: blocked
          ? "Batch resume stayed blocked because exact sink support could not be proven."
          : "Batch resume was simulated locally because the API was unavailable."
      });
    } finally {
      setRemoteBusy(false);
    }
  }, [
    batchResumeMode,
    batchResumeOffset,
    batchResumeReason,
    deploymentSeed,
    document,
    intentName,
    plannedOrchestratorPlan,
    selectedBatchSession,
    selectedRun,
    sources,
    updateDocument,
    workflowTemplate
  ]);

  const filteredLogs = useMemo(
    () => selectedRun?.logs.filter((entry) => (logFilter === "all" ? true : entry.level === logFilter)) ?? [],
    [logFilter, selectedRun]
  );

  const copyCachedOutput = useCallback(async (output: NoodleDesignerCachedOutput | null, runLabel?: string | null) => {
    if (!output?.preview_text.trim()) {
      setNotice({
        id: createId("notice"),
        severity: "info",
        message: "No cached output is available to copy yet."
      });
      return;
    }

    const copied = await copyTextToClipboard(output.preview_text);
    setNotice({
      id: createId("notice"),
      severity: copied ? "success" : "warning",
      message: copied
        ? `Cached preview${runLabel ? ` from ${runLabel}` : ""} copied.`
        : "Clipboard copy failed in this environment."
    });
  }, []);

  const latestPublished = savedDocuments.find((entry) => entry.status === "published" && entry.name === document.name) ?? null;
  const publishReadinessLabel = validationErrors.length
    ? `${validationErrors.length} blocking issue${validationErrors.length === 1 ? "" : "s"}`
    : "Ready to publish";
  const repositoryCoverage = document.connection_refs.length + document.metadata_assets.length + document.schemas.length + document.transformations.length;
  const graphDensityLabel = `${document.nodes.length} nodes / ${document.edges.length} edges`;
  const orchestrationScore = Math.max(
    18,
    Math.min(100, Math.round(((document.nodes.length * 1.2 + document.edges.length + repositoryCoverage) / Math.max(3, document.nodes.length * 3.2)) * 100))
  );
  const repositoryDepth = Math.max(
    12,
    Math.min(
      100,
      Math.round(
        ((document.connection_refs.length * 1.6 + document.metadata_assets.length + document.schemas.length + document.transformations.length * 1.2) /
          Math.max(2, document.nodes.length * 2.4)) *
          100
      )
    )
  );
  const focusTitle = selectedNode
    ? `${selectedNode.label} selected`
    : selectedEdge
      ? "Dependency selected"
      : activeTab === "runs"
        ? "Run review mode"
        : "Canvas ready";
  const focusDescription = selectedNode
    ? `${titleize(selectedNode.kind)} node with ${selectedNode.params.length} parameter${selectedNode.params.length === 1 ? "" : "s"}${selectedNodeTransformation ? ` and linked transformation ${selectedNodeTransformation.name}.` : "."}`
    : selectedEdge
      ? `${document.nodes.find((node) => node.id === selectedEdge.source)?.label ?? selectedEdge.source} flows into ${document.nodes.find((node) => node.id === selectedEdge.target)?.label ?? selectedEdge.target}.`
      : activeTab === "runs"
        ? "Inspect cached previews, task states, and repair readiness without leaving the designer."
        : "Drag stages onto the canvas, connect them left-to-right, and keep repository contracts in sync with the graph.";
  const repositoryVisible = panelFocus === null || panelFocus === "repository";
  const centerVisible = panelFocus === null || panelFocus === "canvas";
  const momoVisible = panelFocus === null || panelFocus === "momo";
  const centerLg = panelFocus === "canvas" ? 12 : canvasExpanded ? 8 : 6;
  const sideLg = panelFocus === "repository" || panelFocus === "momo" ? 12 : canvasExpanded ? 2 : 3;

  return (
    <Stack
      spacing={2.5}
      sx={{
        "--panel-border": "rgba(154, 177, 205, 0.34)",
        "--panel-surface": "rgba(255,255,255,0.84)",
        minHeight: { xs: "auto", lg: "calc(100vh - 180px)" },
        position: "relative",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: "140px -10% auto auto",
          width: 280,
          height: 280,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(111, 208, 255, 0.12) 0%, rgba(111, 208, 255, 0) 72%)",
          pointerEvents: "none"
        },
        "& .MuiButton-root": noodleButtonBaseSx
      }}
    >
      <Card
        sx={{
          borderRadius: 6,
          overflow: "hidden",
          border: "1px solid rgba(10, 37, 71, 0.18)",
          boxShadow: "0 30px 70px rgba(15, 23, 42, 0.16)",
          background:
            "radial-gradient(circle at 12% 20%, rgba(111, 208, 255, 0.24), transparent 20%), radial-gradient(circle at 88% 18%, rgba(246, 196, 92, 0.2), transparent 18%), linear-gradient(135deg, #081b38 0%, #133d73 48%, #205c86 100%)"
        }}
      >
        <CardContent sx={{ p: { xs: 2.25, md: 3 } }}>
          <Stack spacing={2.5}>
            <Stack direction={{ xs: "column", xl: "row" }} justifyContent="space-between" spacing={2.25}>
              <Stack spacing={1.2} sx={{ color: "#f8fbff", maxWidth: 980 }}>
                <Typography variant="overline" sx={{ color: "rgba(214, 234, 255, 0.82)", letterSpacing: "0.18em", fontWeight: 900 }}>
                  Noodle Design Studio
                </Typography>
                <Typography variant="h3" sx={{ fontSize: { xs: "2rem", md: "2.9rem" }, letterSpacing: "-0.05em", lineHeight: 0.96 }}>
                  {document.name}
                </Typography>
                <Typography variant="body1" sx={{ color: "rgba(232, 241, 255, 0.8)", maxWidth: 880, fontSize: { xs: "0.98rem", md: "1.02rem" } }}>
                  Shape the DAG, tune repository-backed contracts, and drive the pipeline from working sketch to publishable release inside one high-signal workspace.
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    label={publishReadinessLabel}
                    sx={{
                      borderRadius: 999,
                      fontWeight: 800,
                      bgcolor: validationErrors.length ? "rgba(250, 204, 21, 0.18)" : "rgba(74, 222, 128, 0.16)",
                      color: validationErrors.length ? "#fde68a" : "#bbf7d0",
                      border: "1px solid rgba(255,255,255,0.16)"
                    }}
                  />
                  <Chip
                    label={document.status === "published" ? "Published workspace" : "Working draft"}
                    sx={{
                      borderRadius: 999,
                      fontWeight: 800,
                      bgcolor: "rgba(255,255,255,0.12)",
                      color: "#f8fbff",
                      border: "1px solid rgba(255,255,255,0.14)"
                    }}
                  />
                  {latestPublished ? (
                    <Chip
                      label={`Latest release v${latestPublished.version}`}
                      sx={{ borderRadius: 999, fontWeight: 800, bgcolor: "rgba(255,255,255,0.08)", color: "#dceafd" }}
                    />
                  ) : null}
                  {workflowTemplate ? (
                    <Chip
                      label={workflowTemplate.replaceAll("-", " ")}
                      sx={{ borderRadius: 999, fontWeight: 800, textTransform: "capitalize", bgcolor: "rgba(119, 217, 255, 0.16)", color: "#b5f0ff" }}
                    />
                  ) : null}
                </Stack>
              </Stack>
              <Stack spacing={1.1} sx={{ minWidth: { xl: 380 } }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} flexWrap="wrap" useFlexGap>
                  <Button
                    variant="outlined"
                    onClick={() => setDocument(buildSeedDocument(intentName, sources, workflowTemplate, deploymentSeed, plannedOrchestratorPlan))}
                    sx={{
                      ...noodleButtonSecondarySx,
                      bgcolor: "rgba(255,255,255,0.1)",
                      color: "#f8fbff",
                      borderColor: "rgba(255,255,255,0.2)",
                      "&:hover": {
                        borderColor: "rgba(255,255,255,0.35)",
                        bgcolor: "rgba(255,255,255,0.16)"
                      }
                    }}
                    disabled={remoteBusy}
                  >
                    Reset Seed
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => void handleSaveVersion("draft")}
                    sx={{
                      ...noodleButtonSecondarySx,
                      bgcolor: "rgba(255,255,255,0.1)",
                      color: "#f8fbff",
                      borderColor: "rgba(255,255,255,0.2)",
                      "&:hover": {
                        borderColor: "rgba(255,255,255,0.35)",
                        bgcolor: "rgba(255,255,255,0.16)"
                      }
                    }}
                    disabled={remoteBusy}
                  >
                    {remoteBusy ? "Saving..." : "Save Draft"}
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => void triggerRun()}
                    sx={{
                      ...noodleButtonSecondarySx,
                      bgcolor: "rgba(255,255,255,0.1)",
                      color: "#f8fbff",
                      borderColor: "rgba(255,255,255,0.2)",
                      "&:hover": {
                        borderColor: "rgba(255,255,255,0.35)",
                        bgcolor: "rgba(255,255,255,0.16)"
                      }
                    }}
                    disabled={remoteBusy}
                  >
                    {remoteBusy ? "Working..." : "Run Pipeline"}
                  </Button>
                  <Button
                    variant="contained"
                    disabled={validationErrors.length > 0 || remoteBusy}
                    onClick={() => void handleSaveVersion("published")}
                    sx={{
                      ...noodleButtonPrimarySx,
                      bgcolor: "#ffd166",
                      color: "#0b1f3a",
                      boxShadow: "0 18px 30px rgba(255, 209, 102, 0.22)",
                      "&:hover": {
                        bgcolor: "#ffc247"
                      }
                    }}
                  >
                    Publish Release
                  </Button>
                </Stack>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 4,
                    border: "1px solid rgba(255,255,255,0.16)",
                    bgcolor: "rgba(5, 18, 37, 0.26)",
                    color: "#dceafd"
                  }}
                >
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} justifyContent="space-between">
                    <Box>
                      <Typography variant="caption" sx={noodleSectionLabelSx}>
                        Focus
                      </Typography>
                      <Typography variant="h6" sx={{ mt: 0.35, color: "#fff", letterSpacing: "-0.03em" }}>
                        {focusTitle}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.35, color: "rgba(232, 241, 255, 0.78)", maxWidth: 520 }}>
                        {focusDescription}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ alignSelf: { md: "flex-start" } }}>
                      <Chip label={`${orchestrationScore}% orchestration`} sx={{ bgcolor: "rgba(111, 208, 255, 0.16)", color: "#b5f0ff", fontWeight: 800 }} />
                      <Chip label={`${repositoryDepth}% repository depth`} sx={{ bgcolor: "rgba(255, 209, 102, 0.16)", color: "#ffe7a8", fontWeight: 800 }} />
                      <Chip label={panelFocus ? `${titleize(panelFocus)} maximized` : "Balanced layout"} sx={{ bgcolor: "rgba(255,255,255,0.08)", color: "#eef6ff", fontWeight: 800 }} />
                    </Stack>
                  </Stack>
                </Box>
              </Stack>
            </Stack>

            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6} xl={3}>
                <Box sx={noodleMetricCardSx}>
                  <Typography variant="caption" sx={noodleSectionLabelSx}>
                    Graph Density
                  </Typography>
                  <Typography variant="h4" sx={{ mt: 0.55, letterSpacing: "-0.05em" }}>
                    {graphDensityLabel}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.55, color: "rgba(232, 241, 255, 0.76)" }}>
                    Interactive DAG canvas with deeper node cards and clearer flow hierarchy.
                  </Typography>
                  <Box sx={{ mt: 1.4, height: 6, borderRadius: 999, bgcolor: "rgba(255,255,255,0.14)" }}>
                    <Box sx={{ width: `${orchestrationScore}%`, height: 1, borderRadius: 999, bgcolor: "#78d8ff" }} />
                  </Box>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} xl={3}>
                <Box sx={noodleMetricCardSx}>
                  <Typography variant="caption" sx={noodleSectionLabelSx}>
                    Repository
                  </Typography>
                  <Typography variant="h4" sx={{ mt: 0.55, letterSpacing: "-0.05em" }}>
                    {repositoryCoverage} contracts
                  </Typography>
                    <Typography variant="body2" sx={{ mt: 0.55, color: "rgba(232, 241, 255, 0.76)" }}>
                      Relative repository coverage for this DAG, based on connection refs, schemas, metadata assets, and transformations versus graph size.
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 1.05, color: "#ffe7a8", fontWeight: 800 }}>
                      {document.connection_refs.length} connections, {document.schemas.length} schemas, {document.metadata_assets.length} metadata assets, {document.transformations.length} transforms.
                    </Typography>
                    <Box sx={{ mt: 1.4, height: 6, borderRadius: 999, bgcolor: "rgba(255,255,255,0.14)" }}>
                      <Box sx={{ width: `${repositoryDepth}%`, height: 1, borderRadius: 999, bgcolor: "#ffd166" }} />
                    </Box>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} xl={3}>
                <Box sx={noodleMetricCardSx}>
                  <Typography variant="caption" sx={noodleSectionLabelSx}>
                    Release State
                  </Typography>
                  <Typography variant="h4" sx={{ mt: 0.55, letterSpacing: "-0.05em" }}>
                    v{document.version}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.55, color: "rgba(232, 241, 255, 0.76)" }}>
                    {latestPublished ? `Last published version is v${latestPublished.version}.` : "This workspace has not been published yet."}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1.05, color: validationErrors.length ? "#ffe7a8" : "#bbf7d0", fontWeight: 800 }}>
                    {validationErrors.length ? "Resolve blockers to publish cleanly." : "Release gate is clear."}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} xl={3}>
                <Box sx={noodleMetricCardSx}>
                  <Typography variant="caption" sx={noodleSectionLabelSx}>
                    Test Runs
                  </Typography>
                  <Typography variant="h4" sx={{ mt: 0.55, letterSpacing: "-0.05em" }}>
                    {document.runs.length} entries
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.55, color: "rgba(232, 241, 255, 0.76)" }}>
                    {selectedRun ? `Latest focus is ${selectedRun.label} with ${titleize(selectedRun.status)} status.` : "Trigger a run to review logs, cache previews, and repair options."}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1.05, color: "#b5f0ff", fontWeight: 800 }}>
                    {document.schedule.enabled ? "Scheduler enabled." : "Manual execution mode."}
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

      <Grid container spacing={2.5}>
        {centerVisible ? (
        <Grid item xs={12} lg={centerLg} sx={{ order: { xs: 2, lg: 2 } }}>
          <Stack spacing={2}>
            {activeTab === "builder" ? (
              <>
            <Card sx={{ ...noodleGlassCardSx, bgcolor: "rgba(243, 249, 255, 0.82)" }}>
              <CardContent sx={{ p: { xs: 1.25, md: 1.5 } }}>
                <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5} alignItems={{ xs: "flex-start", md: "center" }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Test Run</Typography>
                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                      Test run tab is placed below the canvas for quick execution checks.
                    </Typography>
                  </Box>
                  <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={workspaceTabsSx}>
                    <Tab value="builder" label="Design Studio" />
                    <Tab value="runs" label={`Test Run (${document.runs.length})`} />
                  </Tabs>
                </Stack>
              </CardContent>
            </Card>

            <Card sx={noodleGlassCardSx}>
              <CardContent sx={{ p: 2.2 }}>
                <Stack spacing={1.25}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>DAG Canvas</Typography>
                      <Typography variant="body2" sx={{ color: "var(--muted)", maxWidth: 760 }}>
                        Drag stages from the repository, snap dependencies into place, and refine an orchestration-ready DAG without mixing runtime code into the portable spec.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => void triggerRun()}
                        disabled={remoteBusy}
                        sx={noodleButtonPrimarySx}
                      >
                        {remoteBusy ? "Working..." : "Run Pipeline"}
                      </Button>
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
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip label={focusTitle} sx={{ bgcolor: "#e9f5ff", color: "#0d4f8b", fontWeight: 800 }} />
                    <Chip label={`${document.nodes.length} stages`} sx={{ bgcolor: "#fff7e6", color: "#8a5a00", fontWeight: 800 }} />
                    <Chip label={`${document.edges.length} dependencies`} sx={{ bgcolor: "#edf8ef", color: "#22603d", fontWeight: 800 }} />
                    <Chip label="Double-click a node to rename" sx={{ bgcolor: "#f3f4f6", color: "#475467", fontWeight: 700 }} />
                  </Stack>
                  {!canvasCollapsed ? (
                    <Box
                      data-testid="designer-canvas"
                      onDrop={handleDrop}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      sx={{
                        height: canvasHeight,
                        minHeight: 520,
                        borderRadius: 4,
                        overflow: "hidden",
                        position: "relative",
                        border: "1px solid rgba(145, 169, 198, 0.35)",
                        background:
                          "radial-gradient(circle at 0% 0%, rgba(120, 216, 255, 0.22), transparent 20%), radial-gradient(circle at 100% 0%, rgba(255, 209, 102, 0.18), transparent 18%), linear-gradient(180deg, #f9fcff 0%, #f1f7ff 100%)"
                      }}
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
                        minZoom={0.3}
                        maxZoom={1.8}
                        defaultEdgeOptions={{
                          animated: false,
                          style: { stroke: "#2f6ec9", strokeWidth: 2.5 },
                          markerEnd: { type: MarkerType.ArrowClosed, color: "#2f6ec9" }
                        }}
                        snapToGrid
                        snapGrid={[20, 20]}
                        proOptions={{ hideAttribution: true }}
                        style={{ background: "transparent" }}
                      >
                        <MiniMap
                          pannable
                          zoomable
                          nodeStrokeColor={(node) => NODE_COLORS[(node.data?.kind as NoodleDesignerNodeKind) ?? "source"].stroke}
                          nodeColor={(node) => alpha(NODE_COLORS[(node.data?.kind as NoodleDesignerNodeKind) ?? "source"].fill, 0.92)}
                          maskColor="rgba(8, 27, 56, 0.08)"
                          style={{
                            background: "rgba(255,255,255,0.88)",
                            border: "1px solid rgba(148, 163, 184, 0.28)",
                            borderRadius: 18
                          }}
                        />
                        <Controls
                          style={{
                            border: "1px solid rgba(148, 163, 184, 0.32)",
                            borderRadius: 18,
                            overflow: "hidden",
                            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.10)"
                          }}
                        />
                        <Background color="#cfe0f2" gap={20} size={1.2} />
                      </ReactFlow>
                      <Stack
                        spacing={0.6}
                        sx={{
                          position: "absolute",
                          left: 16,
                          bottom: 16,
                          p: 1.3,
                          maxWidth: 340,
                          borderRadius: 3,
                          border: "1px solid rgba(255,255,255,0.8)",
                          bgcolor: "rgba(255,255,255,0.78)",
                          backdropFilter: "blur(16px)",
                          boxShadow: "0 16px 34px rgba(15, 23, 42, 0.10)"
                        }}
                      >
                        <Typography variant="caption" sx={{ color: "#0f4f9b", fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                          Canvas Focus
                        </Typography>
                        <Typography variant="body2" sx={{ color: "#17315c", fontWeight: 700 }}>
                          {focusTitle}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "#60779c" }}>
                          {focusDescription}
                        </Typography>
                      </Stack>
                    </Box>
                  ) : (
                    <Alert severity="info">
                      Design canvas is collapsed. Expand it to continue placing nodes, wiring edges, and editing the DAG visually.
                    </Alert>
                  )}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={noodleGlassCardSx}>
              <CardContent sx={{ p: 2.2 }}>
                <Stack spacing={1.25}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Configuration</Typography>
                  {selectedNode ? (
                    <Stack spacing={1}>
                      <TextField label="Node Label" size="small" value={selectedNode.label} onChange={(event) => updateSelectedNode((node) => ({ ...node, label: event.target.value }))} />
                      <TextField
                        select
                        label="Node Kind"
                        size="small"
                        value={selectedNode.kind}
                        onChange={(event) => {
                          const nextKind = event.target.value as NoodleDesignerNodeKind;
                          updateSelectedNode((node) => (
                            node.kind === nextKind
                              ? node
                              : {
                                  ...node,
                                  kind: nextKind,
                                  params: defaultParamsForKind(nextKind)
                                }
                          ));
                        }}
                      >
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
                      {selectedNode.kind === "cache" ? (
                        <>
                          <Alert severity={latestCachedOutputForSelectedNode ? "success" : "info"}>
                            {latestCachedOutputForSelectedNode
                              ? `${latestCachedOutputForSelectedNode.runLabel} buffered ${formatBytes(latestCachedOutputForSelectedNode.output.captured_bytes)} from ${latestCachedOutputForSelectedNode.output.source_node_label ?? latestCachedOutputForSelectedNode.output.source_node_id}.`
                              : "Wire this cache node after a transform to buffer up to 30 MB of transformed output for inspection."}
                          </Alert>
                          {latestCachedOutputForSelectedNode ? (
                            <Box sx={{ p: 1.2, borderRadius: 2.5, border: "1px solid var(--line)", bgcolor: "#fffaf2" }}>
                              <Stack spacing={1}>
                                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip size="small" label={`Captured ${formatBytes(latestCachedOutputForSelectedNode.output.captured_bytes)}`} />
                                    <Chip size="small" label={`Preview ${formatBytes(latestCachedOutputForSelectedNode.output.preview_bytes)}`} />
                                    <Chip size="small" label={`${latestCachedOutputForSelectedNode.output.approx_records.toLocaleString()} rows est.`} />
                                  </Stack>
                                  <Stack direction="row" spacing={1}>
                                    <Button
                                      size="small"
                                      variant={cachedOutputViewMode === "preview" ? "contained" : "outlined"}
                                      onClick={() => setCachedOutputViewMode("preview")}
                                    >
                                      Preview
                                    </Button>
                                    <Button
                                      size="small"
                                      variant={cachedOutputViewMode === "table" ? "contained" : "outlined"}
                                      onClick={() => setCachedOutputViewMode("table")}
                                    >
                                      Table
                                    </Button>
                                  </Stack>
                                </Stack>
                                <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                  {latestCachedOutputForSelectedNode.output.summary}
                                </Typography>
                                {cachedOutputViewMode === "table" && parseCachedOutputTable(latestCachedOutputForSelectedNode.output.preview_text) ? (
                                  <TableContainer
                                    sx={{
                                      maxHeight: 320,
                                      borderRadius: 2.5,
                                      border: "1px solid rgba(154, 177, 205, 0.34)",
                                      bgcolor: "#fff"
                                    }}
                                  >
                                    <Table stickyHeader size="small">
                                      <TableHead>
                                        <TableRow>
                                          {parseCachedOutputTable(latestCachedOutputForSelectedNode.output.preview_text)?.columns.map((column) => (
                                            <TableCell key={column} sx={{ fontWeight: 800, bgcolor: "#eef6ff", whiteSpace: "nowrap" }}>
                                              {column}
                                            </TableCell>
                                          ))}
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {parseCachedOutputTable(latestCachedOutputForSelectedNode.output.preview_text)?.rows.map((row, rowIndex) => (
                                          <TableRow key={`${latestCachedOutputForSelectedNode.output.id}-row-${rowIndex}`} hover>
                                            {parseCachedOutputTable(latestCachedOutputForSelectedNode.output.preview_text)?.columns.map((column) => (
                                              <TableCell key={`${column}-${rowIndex}`} sx={{ maxWidth: 240, verticalAlign: "top" }}>
                                                <Typography variant="caption" sx={{ color: "#314760", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                                  {formatCachedCellValue(row[column])}
                                                </Typography>
                                              </TableCell>
                                            ))}
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </TableContainer>
                                ) : (
                                  <TextField
                                    label="Latest Cached Preview"
                                    multiline
                                    minRows={6}
                                    maxRows={12}
                                    value={latestCachedOutputForSelectedNode.output.preview_text}
                                    InputProps={{ readOnly: true }}
                                  />
                                )}
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                                  <Button size="small" onClick={() => setActiveTab("runs")}>
                                    Open Test Run Tab
                                  </Button>
                                  <Button
                                    size="small"
                                    onClick={() =>
                                      void copyCachedOutput(
                                        latestCachedOutputForSelectedNode.output,
                                        latestCachedOutputForSelectedNode.runLabel
                                      )
                                    }
                                  >
                                    Copy Preview
                                  </Button>
                                </Stack>
                              </Stack>
                            </Box>
                          ) : null}
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
                <Card sx={{ ...noodleGlassCardSx, bgcolor: "rgba(243, 249, 255, 0.82)" }}>
                  <CardContent sx={{ p: { xs: 1.25, md: 1.5 } }}>
                    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5} alignItems={{ xs: "flex-start", md: "center" }}>
                      <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Test Run</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Review cached outputs, task states, and execution logs from test runs.
                        </Typography>
                      </Box>
                      <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={workspaceTabsSx}>
                        <Tab value="builder" label="Design Studio" />
                        <Tab value="runs" label={`Test Run (${document.runs.length})`} />
                      </Tabs>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={noodleGlassCardSx}>
                  <CardContent sx={{ p: 2.2 }}>
                    <Stack spacing={1.25}>
                      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={1.5}>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Run Control</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Trigger and inspect test runs without leaving the designer.
                          </Typography>
                        </Box>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <Button variant="outlined" onClick={() => void triggerRun()} sx={noodleButtonSecondarySx} disabled={remoteBusy}>
                            {remoteBusy ? "Working..." : "Trigger Test Run"}
                          </Button>
                          <Button
                            variant="contained"
                            onClick={() => void repairRun()}
                            sx={noodleButtonPrimarySx}
                            disabled={remoteBusy || !selectedRunRepairable}
                          >
                            {remoteBusy ? "Working..." : "Repair Selected Run"}
                          </Button>
                        </Stack>
                      </Stack>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip label={`Runs: ${document.runs.length}`} sx={{ bgcolor: "#eef6ff" }} />
                        <Chip label={`Latest: ${selectedRun ? titleize(selectedRun.status) : "No runs"}`} sx={{ bgcolor: "#f8fbff" }} />
                        {selectedRun?.repair_attempt ? <Chip label={`Repair ${selectedRun.repair_attempt}`} color="info" variant="outlined" /> : null}
                        {selectedRun?.repair_outcome ? (
                          <Chip
                            label={titleize(selectedRun.repair_outcome)}
                            color={supportChipColor(selectedRun.repair_outcome)}
                            variant="outlined"
                          />
                        ) : null}
                      </Stack>
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={3}>
                          <TextField
                            select
                            fullWidth
                            size="small"
                            label="Repair Mode"
                            value={repairMode}
                            onChange={(event) => setRepairMode(event.target.value as NoodleDesignerRepairMode)}
                            disabled={!selectedRun}
                          >
                            {REPAIR_MODE_OPTIONS.map((mode) => (
                              <MenuItem key={mode} value={mode}>{titleize(mode)}</MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <TextField
                            select
                            fullWidth
                            size="small"
                            label="Repair Scope"
                            value={repairScope}
                            onChange={(event) => setRepairScope(event.target.value as NoodleDesignerRepairScope)}
                            disabled={!selectedRun}
                          >
                            {REPAIR_SCOPE_OPTIONS.map((scope) => (
                              <MenuItem key={scope} value={scope}>{titleize(scope)}</MenuItem>
                            ))}
                          </TextField>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Repair Reason"
                            value={repairReason}
                            onChange={(event) => setRepairReason(event.target.value)}
                            placeholder="Why are you repairing this run?"
                            disabled={!selectedRun}
                          />
                        </Grid>
                      </Grid>
                      {selectedRun ? (
                        <Alert severity={selectedRunRepairable ? "info" : "warning"}>
                          {selectedRunRepairable
                            ? repairMode === "exact"
                              ? "Exact repair validates sink contracts and lineage before execution. If any rerun task reaches a non-idempotent sink, the attempt is recorded but blocked."
                              : "Best-effort repair reruns the selected task set and preserves prior successful work without claiming exact external effects."
                            : "Repair is enabled only for failed or cancelled runs."}
                        </Alert>
                      ) : (
                        <Alert severity="info">Select a run from the timeline to configure a repair.</Alert>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={5}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent sx={{ p: 2.2 }}>
                        <Stack spacing={1.25}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Batch Session Control</Typography>
                          {selectedBatchSession ? (
                            <>
                              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip label={selectedBatchSession.source_batch_id} variant="outlined" />
                                <Chip label={titleize(selectedBatchSession.status)} color={stateChipColor(selectedBatchSession.status === "committed" ? "success" : selectedBatchSession.status === "partial" ? "failed" : "running")} />
                                <Chip
                                  label={selectedBatchSession.exact_supported ? "Exact supported" : "Best effort only"}
                                  color={selectedBatchSession.exact_supported ? "success" : "warning"}
                                  variant="outlined"
                                />
                              </Stack>
                              <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                Resume from offset {selectedBatchSession.next_offset} of {selectedBatchSession.expected_count}. Schema {selectedBatchSession.schema_fingerprint}.
                              </Typography>
                              <Grid container spacing={2}>
                                <Grid item xs={12} md={4}>
                                  <TextField
                                    select
                                    fullWidth
                                    size="small"
                                    label="Resume Mode"
                                    value={batchResumeMode}
                                    onChange={(event) => setBatchResumeMode(event.target.value as NoodleDesignerRepairMode)}
                                  >
                                    {REPAIR_MODE_OPTIONS.map((mode) => (
                                      <MenuItem key={mode} value={mode}>{titleize(mode)}</MenuItem>
                                    ))}
                                  </TextField>
                                </Grid>
                                <Grid item xs={12} md={4}>
                                  <TextField
                                    fullWidth
                                    size="small"
                                    label="From Offset"
                                    value={batchResumeOffset}
                                    onChange={(event) => setBatchResumeOffset(event.target.value)}
                                  />
                                </Grid>
                                <Grid item xs={12} md={4}>
                                  <Button
                                    fullWidth
                                    variant="contained"
                                    sx={noodleButtonPrimarySx}
                                    disabled={remoteBusy || selectedBatchSession.status === "committed"}
                                    onClick={() => void resumeBatchSession()}
                                  >
                                    {remoteBusy ? "Working..." : "Resume Batch"}
                                  </Button>
                                </Grid>
                              </Grid>
                              <TextField
                                fullWidth
                                size="small"
                                label="Resume Reason"
                                value={batchResumeReason}
                                onChange={(event) => setBatchResumeReason(event.target.value)}
                                placeholder="Why are you resuming this batch?"
                              />
                              <Alert severity={batchResumeMode === "exact" ? (selectedBatchSession.exact_supported ? "success" : "warning") : "info"}>
                                {batchResumeMode === "exact"
                                  ? selectedBatchSession.exact_supported
                                    ? selectedBatchSession.exact_support_summary
                                    : `Exact resume is blocked: ${selectedBatchSession.exact_support_summary}`
                                  : "Best-effort resume will continue from the selected offset and rely on staging or sink dedup semantics."}
                              </Alert>
                            </>
                          ) : (
                            <Alert severity="info">Select a batch session to inspect checkpoint and resume state.</Alert>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={7}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent sx={{ p: 2.2 }}>
                        <Stack spacing={1.25}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Batch Sessions</Typography>
                          {(selectedRunBatchSessions.length ? selectedRunBatchSessions : document.batch_sessions ?? []).length ? (
                            (selectedRunBatchSessions.length ? selectedRunBatchSessions : document.batch_sessions ?? []).map((session) => (
                              <Box
                                key={session.id}
                                onClick={() => setSelectedBatchSessionId(session.id)}
                                sx={{
                                  p: 1.2,
                                  borderRadius: 2.5,
                                  border: session.id === selectedBatchSessionId ? "2px solid var(--accent)" : "1px solid var(--line)",
                                  bgcolor: session.id === selectedBatchSessionId ? "#eef6ff" : "#fff",
                                  cursor: "pointer"
                                }}
                              >
                                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{session.source_batch_id}</Typography>
                                    <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                      {session.source_node_label} · next offset {session.next_offset} / {session.expected_count}
                                    </Typography>
                                  </Box>
                                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip size="small" label={titleize(session.status)} color={session.status === "committed" ? "success" : session.status === "partial" ? "error" : "warning"} />
                                    <Chip size="small" label={`${session.staged_count}/${session.expected_count} staged`} variant="outlined" />
                                    <Chip size="small" label={`${session.attempts.length} attempts`} variant="outlined" />
                                  </Stack>
                                </Stack>
                              </Box>
                            ))
                          ) : (
                            <Alert severity="info">
                              No batch sessions have been recorded yet. Add source-node params like `source_batch_id`, `expected_count`, and optional `fail_after_offset` to exercise partial-batch resume.
                            </Alert>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

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
                                {new Date(run.started_at).toLocaleString()}
                              </Typography>
                              {run.repair_of_run_id ? (
                                <Typography variant="caption" sx={{ display: "block", color: "var(--muted)" }}>
                                  Repair of {run.repair_of_run_id}
                                </Typography>
                              ) : null}
                            </Box>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              <Chip size="small" label={titleize(run.trigger)} variant="outlined" />
                              {run.repair_attempt ? <Chip size="small" label={`Repair ${run.repair_attempt}`} color="info" variant="outlined" /> : null}
                              {run.repair_outcome ? (
                                <Chip size="small" label={titleize(run.repair_outcome)} color={supportChipColor(run.repair_outcome)} variant="outlined" />
                              ) : null}
                              <Chip size="small" label={titleize(run.status)} color={stateChipColor(run.status)} />
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
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Repair Summary</Typography>
                          {selectedRun ? (
                            <>
                              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip label={`Doc v${selectedRun.document_version ?? document.version}`} variant="outlined" />
                                {selectedRun.repair_mode ? <Chip label={titleize(selectedRun.repair_mode)} variant="outlined" /> : null}
                                {selectedRun.repair_outcome ? (
                                  <Chip label={titleize(selectedRun.repair_outcome)} color={supportChipColor(selectedRun.repair_outcome)} />
                                ) : null}
                              </Stack>
                              {selectedRun.repair_attempt_id ? (
                                <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                  Attempt Id: {selectedRun.repair_attempt_id}
                                </Typography>
                              ) : null}
                              {selectedRun.repair_plan ? (
                                <>
                                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                    Rerun {selectedRun.repair_plan.rerun_task_ids.length} tasks, reuse {selectedRun.repair_plan.reused_task_ids.length}, downstream expansion {selectedRun.repair_plan.downstream_task_ids.length}.
                                  </Typography>
                                  {selectedRun.repair_plan.validation_issues.length ? (
                                    selectedRun.repair_plan.validation_issues.map((issue, index) => (
                                      <Alert
                                        key={`${issue.code}-${index}`}
                                        severity={issue.severity === "error" ? "warning" : issue.severity === "warn" ? "warning" : "info"}
                                      >
                                        {issue.message}
                                      </Alert>
                                    ))
                                  ) : (
                                    <Alert severity="success">No repair validation issues were recorded for this run.</Alert>
                                  )}
                                </>
                              ) : (
                                <Alert severity="info">Select a repair attempt to inspect exactness checks and validation issues.</Alert>
                              )}
                            </>
                          ) : (
                            <Alert severity="info">Select a run to inspect repair planning metadata.</Alert>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={7}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent sx={{ p: 2.2 }}>
                        <Stack spacing={1.25}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Lineage and Sink Contracts</Typography>
                          {selectedRun ? (
                            <>
                              {(selectedRun.sink_bindings?.length ?? 0) > 0 ? (
                                selectedRun.sink_bindings?.map((binding) => (
                                  <Box key={`${binding.task_id}-${binding.sink_node_id}`} sx={{ p: 1.2, borderRadius: 2.5, border: "1px solid var(--line)", bgcolor: "#fff" }}>
                                    <Stack spacing={0.75}>
                                      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                                        <Box>
                                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{binding.task_label} to {binding.sink_node_label}</Typography>
                                          <Typography variant="caption" sx={{ color: "var(--muted)" }}>{binding.output_asset_id}</Typography>
                                        </Box>
                                        <Chip size="small" label={titleize(binding.support_level)} color={supportChipColor(binding.support_level)} />
                                      </Stack>
                                      <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                        Plugin {binding.sink_plugin} · Idempotency {binding.idempotency_strategy} · Transaction {binding.transaction_strategy}
                                      </Typography>
                                      {binding.output_version ? (
                                        <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                          Output version {binding.output_version}
                                        </Typography>
                                      ) : null}
                                    </Stack>
                                  </Box>
                                ))
                              ) : (
                                <Alert severity="info">No sink bindings were recorded for the selected run.</Alert>
                              )}
                              {(selectedRun.lineage_records?.length ?? 0) > 0 ? (
                                selectedRun.lineage_records?.map((record) => (
                                  <Box key={record.task_id} sx={{ p: 1.2, borderRadius: 2.5, border: "1px solid var(--line)", bgcolor: "#f8fbff" }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{record.task_label}</Typography>
                                    <Typography variant="caption" sx={{ display: "block", color: "var(--muted)" }}>
                                      Inputs: {record.input_assets.length ? record.input_assets.join(", ") : "None recorded"}
                                    </Typography>
                                    <Typography variant="caption" sx={{ display: "block", color: "var(--muted)" }}>
                                      Outputs: {record.output_assets.length ? record.output_assets.join(", ") : "None recorded"}
                                    </Typography>
                                    {record.output_version ? (
                                      <Typography variant="caption" sx={{ display: "block", color: "var(--muted)" }}>
                                        Version: {record.output_version}
                                      </Typography>
                                    ) : null}
                                  </Box>
                                ))
                              ) : null}
                            </>
                          ) : (
                            <Alert severity="info">Select a run to inspect lineage and sink contracts.</Alert>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 2.2 }}>
                    <Stack spacing={1.25}>
                      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Cached Outputs</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Cache nodes buffer transformed payloads with a 30 MB ceiling and expose a bounded preview for inspection.
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {selectedNode?.kind === "cache" ? (
                            <Chip label={`Filtered to ${selectedNode.label}`} sx={{ alignSelf: "flex-start" }} />
                          ) : null}
                          <Button
                            size="small"
                            variant={cachedOutputViewMode === "preview" ? "contained" : "outlined"}
                            onClick={() => setCachedOutputViewMode("preview")}
                          >
                            Preview
                          </Button>
                          <Button
                            size="small"
                            variant={cachedOutputViewMode === "table" ? "contained" : "outlined"}
                            onClick={() => setCachedOutputViewMode("table")}
                          >
                            Table
                          </Button>
                        </Stack>
                      </Stack>
                      {selectedRun ? (
                        selectedRunCachedOutputs.length ? (
                          selectedRunCachedOutputs.map((output) => (
                            <Box key={output.id} sx={{ p: 1.3, borderRadius: 2.5, border: "1px solid var(--line)", bgcolor: "#fffaf2" }}>
                              <Stack spacing={1}>
                                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{output.node_label}</Typography>
                                    <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                      From {output.source_node_label ?? output.source_node_id} · {output.format.toUpperCase()}
                                    </Typography>
                                  </Box>
                                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip size="small" label={`Buffered ${formatBytes(output.captured_bytes)}`} />
                                    <Chip size="small" label={`Preview ${formatBytes(output.preview_bytes)}`} />
                                    <Chip size="small" label={`${output.approx_records.toLocaleString()} rows est.`} />
                                  </Stack>
                                </Stack>
                                <Typography variant="caption" sx={{ color: "var(--muted)" }}>{output.summary}</Typography>
                                {cachedOutputViewMode === "table" && parseCachedOutputTable(output.preview_text) ? (
                                  <TableContainer
                                    sx={{
                                      maxHeight: 340,
                                      borderRadius: 2.5,
                                      border: "1px solid rgba(154, 177, 205, 0.34)",
                                      bgcolor: "#fff"
                                    }}
                                  >
                                    <Table stickyHeader size="small">
                                      <TableHead>
                                        <TableRow>
                                          {parseCachedOutputTable(output.preview_text)?.columns.map((column) => (
                                            <TableCell key={`${output.id}-${column}`} sx={{ fontWeight: 800, bgcolor: "#eef6ff", whiteSpace: "nowrap" }}>
                                              {column}
                                            </TableCell>
                                          ))}
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {parseCachedOutputTable(output.preview_text)?.rows.map((row, rowIndex) => (
                                          <TableRow key={`${output.id}-table-row-${rowIndex}`} hover>
                                            {parseCachedOutputTable(output.preview_text)?.columns.map((column) => (
                                              <TableCell key={`${output.id}-${column}-${rowIndex}`} sx={{ maxWidth: 240, verticalAlign: "top" }}>
                                                <Typography variant="caption" sx={{ color: "#314760", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                                  {formatCachedCellValue(row[column])}
                                                </Typography>
                                              </TableCell>
                                            ))}
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </TableContainer>
                                ) : (
                                  <TextField
                                    label={`${output.node_label} Preview`}
                                    multiline
                                    minRows={6}
                                    maxRows={14}
                                    value={output.preview_text}
                                    InputProps={{ readOnly: true }}
                                  />
                                )}
                                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                                  <Button size="small" onClick={() => void copyCachedOutput(output, selectedRun.label)}>
                                    Copy Preview
                                  </Button>
                                  {output.truncated ? (
                                    <Typography variant="caption" sx={{ color: "var(--muted)", alignSelf: "center" }}>
                                      Preview is truncated to {formatBytes(output.preview_bytes)} for the UI.
                                    </Typography>
                                  ) : null}
                                </Stack>
                              </Stack>
                            </Box>
                          ))
                        ) : (
                          <Alert severity="info">
                            {selectedNode?.kind === "cache"
                              ? "This cache node has not buffered output in the selected run yet."
                              : "No cache node outputs were produced for the selected run."}
                          </Alert>
                        )
                      ) : (
                        <Alert severity="info">Select a run to inspect cached outputs.</Alert>
                      )}
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
                              <Box
                                key={task.id}
                                sx={{
                                  p: 1.2,
                                  borderRadius: 2.5,
                                  border: "1px solid var(--line)",
                                  bgcolor: selectedRepairTaskIds.includes(task.node_id) ? "#eef6ff" : "#fff"
                                }}
                              >
                                <Stack direction="row" justifyContent="space-between" spacing={1}>
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{task.node_label}</Typography>
                                    <Typography variant="caption" sx={{ color: "var(--muted)" }}>{task.node_id}</Typography>
                                  </Box>
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Chip size="small" label={task.state} color={stateChipColor(task.state)} />
                                    {selectedRunRepairable && (repairScope === "selected" || repairScope === "selected_and_dependents") ? (
                                      <Button size="small" variant={selectedRepairTaskIds.includes(task.node_id) ? "contained" : "outlined"} onClick={() => toggleRepairTask(task.node_id)}>
                                        {selectedRepairTaskIds.includes(task.node_id) ? "Selected" : "Select"}
                                      </Button>
                                    ) : null}
                                  </Stack>
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
            <Card sx={noodleGlassCardSx}>
              <CardContent sx={{ p: 2.2 }}>
                <Stack spacing={1.25}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography variant="overline" sx={{ color: "var(--accent)", fontWeight: 900, letterSpacing: "0.14em" }}>
                        Pipeline Repository
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>Repository</Typography>
                      <Typography variant="body2" sx={{ color: "var(--muted)", maxWidth: 360 }}>
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
                  <Box sx={sidePanelHeroSx}>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip label={`${document.connection_refs.length} connections`} sx={{ bgcolor: "#e8f3ff", color: "#0e4e8b", fontWeight: 800 }} />
                        <Chip label={`${document.metadata_assets.length} metadata`} sx={{ bgcolor: "#f3f4f6", color: "#475467", fontWeight: 800 }} />
                        <Chip label={`${document.schemas.length} schemas`} sx={{ bgcolor: "#edf8ef", color: "#215c3d", fontWeight: 800 }} />
                        <Chip label={`${document.transformations.length} transforms`} sx={{ bgcolor: "#fff5e5", color: "#8a5a00", fontWeight: 800 }} />
                      </Stack>
                      <Typography variant="body2" sx={{ color: "#47627f" }}>
                        Stored now: {document.connection_refs.length} connections, {document.metadata_assets.length} metadata assets, {document.schemas.length} schemas, and {document.transformations.length} transformations.
                      </Typography>
                    </Stack>
                  </Box>
                  {!repositoryCollapsed ? (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {REPOSITORY_SECTIONS.map((section) => (
                        <Chip
                          key={section}
                          label={titleize(section)}
                          onClick={() => setRepositorySection(section)}
                          variant={repositorySection === section ? "filled" : "outlined"}
                          sx={repositorySectionChipSx(repositorySection === section)}
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
                        sx={{
                          p: 1.35,
                          borderRadius: 3,
                          border: `1px solid ${alpha(NODE_COLORS[entry.kind].stroke, 0.34)}`,
                          background: `linear-gradient(180deg, ${alpha("#ffffff", 0.88)} 0%, ${alpha(NODE_COLORS[entry.kind].fill, 0.98)} 100%)`,
                          cursor: "grab",
                          boxShadow: "0 12px 24px rgba(15, 23, 42, 0.06)"
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: NODE_COLORS[entry.kind].accent }}>
                              {entry.label}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "var(--muted)" }}>{entry.description}</Typography>
                          </Box>
                          <Button
                            size="small"
                            onClick={() => insertNode(entry.kind)}
                            sx={{
                              borderColor: alpha(NODE_COLORS[entry.kind].stroke, 0.45),
                              color: NODE_COLORS[entry.kind].accent,
                              bgcolor: "#ffffffd8",
                              "&:hover": { bgcolor: "#fff" }
                            }}
                          >
                            Add
                          </Button>
                        </Stack>
                      </Box>
                    ))}

                    <Divider sx={{ mt: 0.5 }} />
                    <Alert severity="info">
                      Use the <strong>Cache</strong> node in the library to buffer transformed output in-line with the DAG. Each cache node keeps a bounded preview while representing up to 30 MB of buffered data per run.
                    </Alert>
                  </Stack>
                    </>
                  ) : null}

                  {repositorySection === "connections" ? (
                    <>
                  <Divider />

                  <Stack spacing={1.2}>
                      <Box sx={repositoryContentCardSx}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} justifyContent="space-between">
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 800 }}>Connection Catalog</Typography>
                            <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                              Switch plugin families quickly and keep each connection aligned to its runtime adapter template.
                            </Typography>
                          </Box>
                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip label={`${document.connection_refs.length} refs`} sx={{ bgcolor: "#e8f3ff", color: "#0e4e8b", fontWeight: 800 }} />
                            {selectedConnection ? (
                              <Chip label={titleize(selectedConnection.plugin.replace("-plugin", ""))} sx={{ bgcolor: "#fff5e5", color: "#8a5a00", fontWeight: 800 }} />
                            ) : null}
                          </Stack>
                        </Stack>
                      </Box>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>Connections</Typography>
                        <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          onClick={() => {
                            const nextItem = buildConnectionRef("database", "database");
                            updateDocument((current) => ({ ...current, connection_refs: [...current.connection_refs, nextItem] }));
                            setSelectedConnectionId(nextItem.id);
                          }}
                        >
                          Add Database
                        </Button>
                        <Button
                          size="small"
                          onClick={() => {
                            const nextItem = buildConnectionRef("github", "github");
                            updateDocument((current) => ({ ...current, connection_refs: [...current.connection_refs, nextItem] }));
                            setSelectedConnectionId(nextItem.id);
                          }}
                        >
                          Add GitHub
                        </Button>
                        <Button
                          size="small"
                          onClick={() => {
                            const nextItem = buildConnectionRef("custom");
                            updateDocument((current) => ({ ...current, connection_refs: [...current.connection_refs, nextItem] }));
                            setSelectedConnectionId(nextItem.id);
                          }}
                        >
                          Add
                        </Button>
                      </Stack>
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {document.connection_refs.map((item) => (
                        <Chip
                          key={item.id}
                          label={item.name}
                          onClick={() => setSelectedConnectionId(item.id)}
                          variant={item.id === selectedConnectionId ? "filled" : "outlined"}
                          sx={repositoryListChipSx(item.id === selectedConnectionId)}
                        />
                      ))}
                    </Stack>
                    {selectedConnection ? (
                      <Stack spacing={1.2}>
                        <Box sx={repositoryContentCardSx}>
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} justifyContent="space-between">
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 800 }}>
                                {selectedConnection.name}
                              </Typography>
                              <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                Plugin-backed connection contract with environment, auth reference, and structured adapter parameters.
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              <Chip label={selectedConnection.environment || "unset"} sx={{ bgcolor: "#f3f4f6", color: "#475467", fontWeight: 800 }} />
                              <Chip label={titleize(selectedConnection.plugin.replace("-plugin", ""))} sx={{ bgcolor: "#e8f3ff", color: "#0e4e8b", fontWeight: 800 }} />
                            </Stack>
                          </Stack>
                        </Box>
                        <TextField label="Connection Name" size="small" value={selectedConnection.name} onChange={(event) => updateSelectedConnection((item) => ({ ...item, name: event.target.value }))} />
                        <TextField
                          select
                          label="Plugin"
                          size="small"
                          value={selectedConnection.plugin}
                          onChange={(event) =>
                            updateSelectedConnection((item) =>
                              item.plugin === event.target.value
                                ? item
                                : applyConnectionTemplate(item, event.target.value, "replace")
                            )
                          }
                          helperText="Changing plugin families replaces the parameter template so the connection matches the new adapter."
                        >
                          {CONNECTION_PLUGIN_OPTIONS.map((plugin) => (
                            <MenuItem key={plugin} value={plugin}>{plugin}</MenuItem>
                          ))}
                        </TextField>
                        <TextField label="Environment" size="small" value={selectedConnection.environment} onChange={(event) => updateSelectedConnection((item) => ({ ...item, environment: event.target.value }))} />
                        <TextField
                          label="Auth Ref"
                          size="small"
                          value={selectedConnection.auth_ref}
                          onChange={(event) => updateSelectedConnection((item) => ({ ...item, auth_ref: event.target.value }))}
                          helperText={authRefHelperTextForPlugin(selectedConnection.plugin)}
                        />
                        <Box sx={repositoryContentCardSx}>
                        <Stack spacing={1}>
                          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ xs: "stretch", sm: "center" }} spacing={1}>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 800 }}>Connection Parameters</Typography>
                              <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                {connectionParameterHelpText(selectedConnection.plugin)}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={1}>
                              <Button
                                size="small"
                                onClick={() =>
                                  updateSelectedConnection((item) => ({
                                    ...item,
                                    params: [...item.params, { key: "", value: "" }]
                                  }))
                                }
                              >
                                Add Parameter
                              </Button>
                              <Button
                                size="small"
                                onClick={() =>
                                  updateSelectedConnection((item) => applyConnectionTemplate(item, item.plugin, "replace"))
                                }
                              >
                                Apply Template
                              </Button>
                            </Stack>
                          </Stack>
                          {selectedConnection.params.length ? (
                            selectedConnection.params.map((param, index) => (
                              <Stack key={`${selectedConnection.id}-param-${index}`} direction={{ xs: "column", md: "row" }} spacing={1}>
                                <TextField
                                  label="Key"
                                  size="small"
                                  value={param.key}
                                  onChange={(event) =>
                                    updateSelectedConnection((item) => ({
                                      ...item,
                                      params: item.params.map((entry, entryIndex) =>
                                        entryIndex === index ? { ...entry, key: event.target.value } : entry
                                      )
                                    }))
                                  }
                                  sx={{ flex: 1 }}
                                />
                                <TextField
                                  label="Value"
                                  size="small"
                                  value={param.value}
                                  onChange={(event) =>
                                    updateSelectedConnection((item) => ({
                                      ...item,
                                      params: item.params.map((entry, entryIndex) =>
                                        entryIndex === index ? { ...entry, value: event.target.value } : entry
                                      )
                                    }))
                                  }
                                  sx={{ flex: 1.3 }}
                                />
                                <Button
                                  color="error"
                                  onClick={() =>
                                    updateSelectedConnection((item) => ({
                                      ...item,
                                      params: item.params.filter((_, entryIndex) => entryIndex !== index)
                                    }))
                                  }
                                >
                                  Remove
                                </Button>
                              </Stack>
                            ))
                          ) : (
                            <Alert severity="info">No structured parameters yet. Add them here or apply the plugin template.</Alert>
                          )}
                        </Stack>
                        </Box>
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

                  {repositorySection === "deployment" ? (
                    <>
                  <Divider />

                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Deployment</Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption" sx={{ color: "var(--muted)" }}>Enable</Typography>
                        <Switch
                          checked={document.deployment.enabled}
                          onChange={(event) =>
                            updateDocument((current) => ({
                              ...current,
                              deployment: {
                                ...current.deployment,
                                enabled: event.target.checked
                              }
                            }))
                          }
                        />
                      </Stack>
                    </Stack>
                    <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                      Store the Git repository and backend deploy contract here when this pipeline should be built and deployed from source control.
                    </Typography>
                    <TextField
                      select
                      label="Repository Provider"
                      size="small"
                      value={document.deployment.repository.provider}
                      onChange={(event) =>
                        updateDocument((current) => ({
                          ...current,
                          deployment: {
                            ...current.deployment,
                            repository: {
                              ...current.deployment.repository,
                              provider: event.target.value as NoodleDesignerDeployment["repository"]["provider"]
                            }
                          }
                        }))
                      }
                    >
                      {DEPLOYMENT_PROVIDER_OPTIONS.map((provider) => (
                        <MenuItem key={provider} value={provider}>{provider}</MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      label="Repository Connection"
                      size="small"
                      value={document.deployment.repository.connection_id ?? ""}
                      onChange={(event) =>
                        updateDocument((current) => ({
                          ...current,
                          deployment: {
                            ...current.deployment,
                            repository: {
                              ...current.deployment.repository,
                              connection_id: event.target.value || null
                            }
                          }
                        }))
                      }
                      helperText="Optional. Use a GitHub connection ref if the deploy workflow needs stored auth or repo credentials."
                    >
                      <MenuItem value="">No connection</MenuItem>
                      {document.connection_refs
                        .filter((item) => item.plugin === "github-plugin" || item.plugin === "custom-plugin")
                        .map((item) => (
                          <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                      label="Repository"
                      size="small"
                      value={document.deployment.repository.repository}
                      onChange={(event) =>
                        updateDocument((current) => ({
                          ...current,
                          deployment: {
                            ...current.deployment,
                            repository: {
                              ...current.deployment.repository,
                              repository: event.target.value
                            }
                          }
                        }))
                      }
                      helperText="For GitHub, use owner/repo."
                    />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <TextField
                        label="Branch"
                        size="small"
                        value={document.deployment.repository.branch}
                        onChange={(event) =>
                          updateDocument((current) => ({
                            ...current,
                            deployment: {
                              ...current.deployment,
                              repository: {
                                ...current.deployment.repository,
                                branch: event.target.value
                              }
                            }
                          }))
                        }
                        sx={{ flex: 1 }}
                      />
                      <TextField
                        label="Backend Path"
                        size="small"
                        value={document.deployment.repository.backend_path}
                        onChange={(event) =>
                          updateDocument((current) => ({
                            ...current,
                            deployment: {
                              ...current.deployment,
                              repository: {
                                ...current.deployment.repository,
                                backend_path: event.target.value
                              }
                            }
                          }))
                        }
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <TextField
                        select
                        label="Deploy Target"
                        size="small"
                        value={document.deployment.deploy_target}
                        onChange={(event) =>
                          updateDocument((current) => ({
                            ...current,
                            deployment: {
                              ...current.deployment,
                              deploy_target: event.target.value as NoodleDesignerDeployment["deploy_target"]
                            }
                          }))
                        }
                        sx={{ flex: 1 }}
                      >
                        {DEPLOYMENT_TARGET_OPTIONS.map((target) => (
                          <MenuItem key={target} value={target}>{target}</MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        label="Artifact Name"
                        size="small"
                        value={document.deployment.artifact_name}
                        onChange={(event) =>
                          updateDocument((current) => ({
                            ...current,
                            deployment: {
                              ...current.deployment,
                              artifact_name: event.target.value
                            }
                          }))
                        }
                        sx={{ flex: 1 }}
                      />
                    </Stack>
                    <TextField
                      label="Workflow Ref"
                      size="small"
                      value={document.deployment.repository.workflow_ref}
                      onChange={(event) =>
                        updateDocument((current) => ({
                          ...current,
                          deployment: {
                            ...current.deployment,
                            repository: {
                              ...current.deployment.repository,
                              workflow_ref: event.target.value
                            }
                          }
                        }))
                      }
                      helperText="For GitHub, this is usually .github/workflows/deploy.yml."
                    />
                    <TextField
                      label="Build Command"
                      size="small"
                      value={document.deployment.build_command}
                      onChange={(event) =>
                        updateDocument((current) => ({
                          ...current,
                          deployment: {
                            ...current.deployment,
                            build_command: event.target.value
                          }
                        }))
                      }
                    />
                    <TextField
                      label="Deploy Command"
                      size="small"
                      value={document.deployment.deploy_command}
                      onChange={(event) =>
                        updateDocument((current) => ({
                          ...current,
                          deployment: {
                            ...current.deployment,
                            deploy_command: event.target.value
                          }
                        }))
                      }
                    />
                    <TextField
                      label="Notes"
                      size="small"
                      multiline
                      minRows={3}
                      value={document.deployment.notes}
                      onChange={(event) =>
                        updateDocument((current) => ({
                          ...current,
                          deployment: {
                            ...current.deployment,
                            notes: event.target.value
                          }
                        }))
                      }
                    />
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
                        <Tooltip title="Copy pipeline JSON">
                          <IconButton size="small" onClick={() => void copyRawSpec()} aria-label="Copy pipeline JSON" sx={panelIconButtonSx}>
                            <ContentCopyRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
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
                    <Box sx={{ p: 1.4, borderRadius: 3, bgcolor: "rgba(247, 250, 255, 0.9)", border: "1px dashed rgba(154, 177, 205, 0.44)" }}>
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Repository content is collapsed. Expand it to manage connections, metadata, schemas, transformations, and the raw JSON spec.
                      </Typography>
                    </Box>
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
            <Card sx={noodleGlassCardSx}>
              <CardContent sx={{ p: 2.2 }}>
                <Stack spacing={1.25}>
                  <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                    <Box>
                      <Typography variant="overline" sx={{ color: "var(--accent)", fontWeight: 900, letterSpacing: "0.14em" }}>
                        Design Copilot
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>Agent Momo</Typography>
                      <Typography variant="body2" sx={{ color: "var(--muted)", maxWidth: 360 }}>
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
                  <Box sx={sidePanelHeroSx}>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip label={`${momoMessages.length} messages`} sx={{ bgcolor: "#e8f3ff", color: "#0e4e8b", fontWeight: 800 }} />
                        <Chip label={savedArchitecture ? "Architecture loaded" : "Blueprint only"} sx={{ bgcolor: "#edf8ef", color: "#215c3d", fontWeight: 800 }} />
                        <Chip label={momoSuggestion ? "Suggestion ready" : "Guidance mode"} sx={{ bgcolor: "#fff5e5", color: "#8a5a00", fontWeight: 800 }} />
                      </Stack>
                      <Typography variant="body2" sx={{ color: "#47627f" }}>
                        Use Momo for transformation scaffolds, orchestration guidance, and architecture-aware design decisions.
                      </Typography>
                    </Stack>
                  </Box>
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
                  {momoSuggestion ? (
                    <Box sx={{ p: 1.4, borderRadius: 2.5, bgcolor: "#fffaf2", border: "1px solid #f3d6a4" }}>
                      <Stack spacing={1}>
                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                          <Box>
                            <Typography variant="caption" sx={{ color: "#9a6700", fontWeight: 800 }}>
                              SUGGESTED TRANSFORMATION
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.5, color: "var(--text)", fontWeight: 700 }}>
                              {momoSuggestion.targetNodeLabel}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                              {momoSuggestion.replacesExisting ? "Will replace the current linked transformation." : "Will create and link a new transformation record."}
                            </Typography>
                          </Box>
                          <Chip size="small" label={momoSuggestion.transformation.mode} color="warning" variant="outlined" sx={{ alignSelf: "flex-start" }} />
                        </Stack>
                        <TextField
                          label="Suggested Code"
                          size="small"
                          multiline
                          minRows={7}
                          maxRows={16}
                          value={momoSuggestion.transformation.code}
                          InputProps={{ readOnly: true }}
                        />
                        <TextField
                          label="Suggested Config JSON"
                          size="small"
                          multiline
                          minRows={5}
                          maxRows={12}
                          value={momoSuggestion.transformation.config_json}
                          InputProps={{ readOnly: true }}
                        />
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                          <Button variant="contained" onClick={applyMomoSuggestion} sx={{ bgcolor: "var(--accent)", color: "#fff", "&:hover": { bgcolor: "#265db8" } }}>
                            Apply Suggestion
                          </Button>
                          <Button variant="outlined" onClick={() => setMomoSuggestion(null)} sx={noodleButtonSecondarySx}>
                            Dismiss
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  ) : null}
                  <Stack
                    spacing={1}
                    sx={{
                      maxHeight: panelFocus === "momo" ? "calc(100vh - 360px)" : 420,
                      overflowY: "auto",
                      p: 1.1,
                      borderRadius: 3.5,
                      border: "1px solid rgba(154, 177, 205, 0.28)",
                      bgcolor: "rgba(245, 249, 255, 0.76)"
                    }}
                  >
                    {momoMessages.map((message) => (
                      <Box
                        key={message.id}
                        sx={{
                          alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                          maxWidth: "100%",
                          p: 1.4,
                          borderRadius: 3.5,
                          border: message.role === "user" ? "1px solid rgba(49, 111, 214, 0.18)" : "1px solid rgba(11, 91, 127, 0.14)",
                          bgcolor: message.role === "user" ? "rgba(232, 243, 255, 0.94)" : "rgba(255,255,255,0.96)",
                          boxShadow: "0 10px 22px rgba(15, 23, 42, 0.05)"
                        }}
                      >
                        <Typography variant="caption" sx={{ color: message.role === "user" ? "var(--accent)" : "#0b5b7f", fontWeight: 900, letterSpacing: "0.08em" }}>
                          {message.role === "user" ? "YOU" : "AGENT MOMO"}
                        </Typography>
                        <Typography variant="body2" sx={{ color: "var(--text)", mt: 0.5, whiteSpace: "pre-wrap" }}>
                          {message.content}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                  <TextField
                    label="Ask Agent Momo"
                    multiline
                    minRows={4}
                    value={momoPrompt}
                    onChange={(event) => setMomoPrompt(event.target.value)}
                    placeholder="How should I model plugin-backed sources, metadata, scheduling, or task dependencies?"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 3,
                        bgcolor: "rgba(255,255,255,0.94)"
                      }
                    }}
                  />
                  <Button variant="contained" onClick={sendMomoMessage} sx={noodleButtonPrimarySx}>
                    Send To Agent Momo
                  </Button>
                    </>
                  ) : (
                    <Box sx={{ p: 1.4, borderRadius: 3, bgcolor: "rgba(247, 250, 255, 0.9)", border: "1px dashed rgba(154, 177, 205, 0.44)" }}>
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Agent Momo is collapsed. Expand it to review architecture context, message history, and design guidance.
                      </Typography>
                    </Box>
                  )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={noodleGlassCardSx}>
                  <CardContent sx={{ p: 2.2 }}>
                    <Stack spacing={1.25}>
                  <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: "-0.02em" }}>Validation Status</Typography>
                    <Chip
                      label={validations.length ? `${validations.length} issue${validations.length === 1 ? "" : "s"}` : "All clear"}
                      sx={{
                        bgcolor: validations.length ? "#fff5e5" : "#edf8ef",
                        color: validations.length ? "#8a5a00" : "#215c3d",
                        fontWeight: 800
                      }}
                    />
                  </Stack>
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
        open={Boolean(runNotice)}
        autoHideDuration={7000}
        onClose={() => setRunNotice(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {runNotice ? (
          <Alert severity={runNotice.severity} onClose={() => setRunNotice(null)} sx={{ width: "100%" }}>
            {runNotice.message}
          </Alert>
        ) : <span />}
      </Snackbar>
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
