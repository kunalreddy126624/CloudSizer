import type { PipelineNodeDefinition, PipelineNodeType, PipelineSpec, ScheduleMode } from "@data-platform/types";

import { nodeCatalogMap } from "./catalog";

export interface OpalTemplate {
  id: string;
  label: string;
  description: string;
  prompt: string;
}

export interface PromptApplyResult {
  spec: PipelineSpec;
  summary: string;
  operations: string[];
}

const SOURCE_RULES: Array<{ type: PipelineNodeType; terms: string[] }> = [
  { type: "source.postgres", terms: ["postgres", "database", "db", "warehouse export"] },
  { type: "source.s3", terms: ["s3", "bucket", "csv", "parquet", "file", "object storage"] }
];

const TRANSFORM_RULES: Array<{ type: PipelineNodeType; terms: string[] }> = [
  { type: "transform.sql", terms: ["sql", "query", "join", "aggregate", "filter", "warehouse logic"] },
  { type: "transform.python", terms: ["python", "script", "enrich", "normalize", "clean", "custom logic"] }
];

const SINK_RULES: Array<{ type: PipelineNodeType; terms: string[] }> = [
  { type: "sink.snowflake", terms: ["snowflake"] },
  { type: "sink.bigquery", terms: ["bigquery", "bq"] },
  { type: "sink.cache_log", terms: ["cache", "log", "debug", "preview", "qa log"] }
];

const SCHEDULE_RULES: Array<{ mode: ScheduleMode; cron: string | null; terms: string[] }> = [
  { mode: "cron", cron: "0 * * * *", terms: ["hourly", "every hour"] },
  { mode: "cron", cron: "0 6 * * *", terms: ["daily", "every day", "each day"] },
  { mode: "cron", cron: "0 9 * * 1", terms: ["weekly", "every monday"] },
  { mode: "event", cron: null, terms: ["event", "webhook", "real time", "realtime"] }
];

const OPAL_TEMPLATES: OpalTemplate[] = [
  {
    id: "daily-sales",
    label: "Daily Sales Digest",
    description: "Extract data, transform it, and publish an analytics-ready table on a schedule.",
    prompt: "Build a daily workflow that reads sales data from Postgres, transforms it with SQL, and loads the result into Snowflake."
  },
  {
    id: "s3-to-bigquery",
    label: "S3 To BigQuery",
    description: "Land object storage files into BigQuery with a light transformation step.",
    prompt: "Create an hourly workflow that reads parquet files from S3, applies a Python cleanup step, and writes into BigQuery."
  },
  {
    id: "debug-runbook",
    label: "Debug Runbook",
    description: "Capture outputs and logs for dry runs while you refine the workflow.",
    prompt: "Create a manual workflow that reads from Postgres, transforms with Python, and sends outputs to a cache log for preview."
  }
];

function cloneSpec(spec: PipelineSpec): PipelineSpec {
  return JSON.parse(JSON.stringify(spec)) as PipelineSpec;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function createNode(type: PipelineNodeType, index: number): PipelineNodeDefinition {
  const catalog = nodeCatalogMap[type];
  return {
    id: `${type.replace(".", "_")}_${index + 1}`,
    type,
    name: catalog.label,
    description: catalog.description,
    category: catalog.category,
    position: { x: 120 + index * 260, y: 180 },
    config: { ...catalog.defaultConfig },
    retry: { retries: 1, backoffSeconds: 60 },
    timeout: { executionSeconds: 900 },
    resources: { cpu: "500m", memory: "1Gi", pool: "default" },
    tags: []
  };
}

function inferNodeTypes(prompt: string) {
  const lower = prompt.toLowerCase();
  const detected: PipelineNodeType[] = [];

  for (const rule of SOURCE_RULES) {
    if (rule.terms.some((term) => lower.includes(term))) {
      detected.push(rule.type);
      break;
    }
  }

  for (const rule of TRANSFORM_RULES) {
    if (rule.terms.some((term) => lower.includes(term))) {
      detected.push(rule.type);
    }
  }

  for (const rule of SINK_RULES) {
    if (rule.terms.some((term) => lower.includes(term))) {
      detected.push(rule.type);
    }
  }

  if (!detected.some((type) => type.startsWith("source."))) {
    detected.unshift("source.postgres");
  }
  if (!detected.some((type) => type.startsWith("transform."))) {
    detected.push("transform.sql");
  }
  if (!detected.some((type) => type.startsWith("sink."))) {
    detected.push("sink.snowflake");
  }

  return [...new Set(detected)];
}

function inferSchedule(prompt: string, baseSpec: PipelineSpec) {
  const lower = prompt.toLowerCase();
  const matched = SCHEDULE_RULES.find((rule) => rule.terms.some((term) => lower.includes(term)));
  if (matched) {
    return {
      mode: matched.mode,
      cron: matched.cron,
      timezone: baseSpec.schedule.timezone ?? "UTC"
    };
  }

  if (lower.includes("manual")) {
    return {
      mode: "manual" as const,
      cron: null,
      timezone: baseSpec.schedule.timezone ?? "UTC"
    };
  }

  return baseSpec.schedule;
}

function inferName(prompt: string, fallback: string) {
  const cleaned = prompt.replace(/^(build|create|make)\s+/i, "").trim();
  if (!cleaned) return fallback;
  const candidate = cleaned.split(/[.!?]/)[0]?.trim() ?? fallback;
  if (!candidate) return fallback;
  return candidate.length > 68 ? `${candidate.slice(0, 65).trim()}...` : candidate.replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildSpecFromTypes(baseSpec: PipelineSpec, types: PipelineNodeType[], prompt: string) {
  const spec = cloneSpec(baseSpec);
  spec.name = inferName(prompt, baseSpec.name);
  spec.description = prompt.trim() || baseSpec.description;
  spec.pipelineId = slugify(spec.name) || baseSpec.pipelineId;
  spec.schedule = inferSchedule(prompt, baseSpec);
  spec.nodes = types.map((type, index) => createNode(type, index));
  spec.edges = spec.nodes.flatMap((node, index) => {
    const target = spec.nodes[index + 1];
    if (!target) {
      return [];
    }

    return [
      {
        id: `edge_${index + 1}`,
        source: node.id,
        target: target.id
      }
    ];
  });
  return spec;
}

function appendNodes(baseSpec: PipelineSpec, prompt: string) {
  const spec = cloneSpec(baseSpec);
  const inferredTypes = inferNodeTypes(prompt);
  const existingTypes = new Set(spec.nodes.map((node) => node.type));
  const nextTypes = inferredTypes.filter((type) => !existingTypes.has(type));

  const operations: string[] = [];
  nextTypes.forEach((type, offset) => {
    const nextNode = createNode(type, spec.nodes.length + offset);
    const previousNode = spec.nodes.at(-1);
    spec.nodes.push(nextNode);
    operations.push(`Added ${nodeCatalogMap[type].label}.`);
    if (previousNode) {
      spec.edges.push({
        id: `edge_${previousNode.id}_${nextNode.id}`,
        source: previousNode.id,
        target: nextNode.id
      });
    }
  });

  spec.schedule = inferSchedule(prompt, spec);
  if (!spec.description || spec.description === baseSpec.description) {
    spec.description = prompt.trim() || baseSpec.description;
  }

  return { spec, operations };
}

export function getOpalTemplates() {
  return OPAL_TEMPLATES;
}

export function applyPromptToPipeline(baseSpec: PipelineSpec, prompt: string, mode: "replace" | "append" = "replace"): PromptApplyResult {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return { spec: cloneSpec(baseSpec), summary: "Enter a prompt to generate or edit the workflow.", operations: [] };
  }

  if (mode === "append") {
    const { spec, operations } = appendNodes(baseSpec, trimmedPrompt);
    return {
      spec,
      operations,
      summary: operations.length > 0 ? operations.join(" ") : "No new steps were inferred from that prompt."
    };
  }

  const inferredTypes = inferNodeTypes(trimmedPrompt);
  const spec = buildSpecFromTypes(baseSpec, inferredTypes, trimmedPrompt);
  const operations = inferredTypes.map((type, index) => `Step ${index + 1}: ${nodeCatalogMap[type].label}.`);

  return {
    spec,
    operations,
    summary: `Generated ${spec.nodes.length} workflow steps from your prompt.`
  };
}
