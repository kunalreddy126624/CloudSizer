import type { PipelineRecord, PipelineRun, Repo, RunLog, TreeNode, ValidationIssue } from "@data-platform/types";

import { DataPlatformClient } from "@data-platform/sdk";

import type { AgentMomoApiPayload, AgentMomoResponse, NoodlePipelineIntentCatalogResponse } from "@/lib/noodle-designer";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const client = new DataPlatformClient(apiBaseUrl);

function formatApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error((await response.text()) || `Request to ${path} failed.`);
  }
  return (await response.json()) as T;
}

function normalizeRepo(input: any): Repo {
  return {
    id: input.id,
    workspaceId: input.workspace_id ?? input.workspaceId,
    name: input.name,
    slug: input.slug,
    description: input.description,
    rootPath: input.root_path ?? input.rootPath,
    createdAt: input.created_at ?? input.createdAt,
    updatedAt: input.updated_at ?? input.updatedAt
  };
}

function normalizeTree(node: any): TreeNode {
  return {
    id: node.id,
    name: node.name,
    path: node.path,
    kind: node.kind,
    artifactType: node.artifact_type ?? node.artifactType,
    children: (node.children ?? []).map(normalizeTree)
  };
}

function normalizePipeline(input: any): PipelineRecord {
  return {
    id: input.id,
    artifactId: input.artifact_id ?? input.artifactId,
    name: input.name,
    description: input.description,
    publishState: input.publish_state ?? input.publishState,
    currentVersion: input.current_version ?? input.currentVersion,
    spec: input.spec,
    createdAt: input.created_at ?? input.createdAt,
    updatedAt: input.updated_at ?? input.updatedAt
  };
}

function normalizeRun(input: any): PipelineRun {
  return {
    id: input.id,
    pipelineId: input.pipeline_id ?? input.pipelineId,
    version: input.version,
    state: input.state,
    trigger: input.trigger,
    startedAt: input.started_at ?? input.startedAt,
    finishedAt: input.finished_at ?? input.finishedAt,
    createdAt: input.created_at ?? input.createdAt,
    updatedAt: input.updated_at ?? input.updatedAt
  };
}

function normalizePipelineIntentCatalog(input: any): NoodlePipelineIntentCatalogResponse {
  return {
    items: (input.items ?? []).map((item: any) => ({
      id: item.id,
      name: item.name,
      summary: item.summary,
      tags: item.tags ?? [],
      recommendedWorkflowTemplate: item.recommended_workflow_template ?? item.recommendedWorkflowTemplate,
      intent: {
        name: item.intent.name,
        businessGoal: item.intent.business_goal ?? item.intent.businessGoal,
        deploymentScope: item.intent.deployment_scope ?? item.intent.deploymentScope,
        latencySlo: item.intent.latency_slo ?? item.intent.latencySlo,
        requiresMlFeatures: item.intent.requires_ml_features ?? item.intent.requiresMlFeatures ?? false,
        requiresRealtimeServing: item.intent.requires_realtime_serving ?? item.intent.requiresRealtimeServing ?? false,
        containsSensitiveData: item.intent.contains_sensitive_data ?? item.intent.containsSensitiveData ?? false,
        targetConsumers: item.intent.target_consumers ?? item.intent.targetConsumers ?? [],
        sources: (item.intent.sources ?? []).map((source: any) => ({
          name: source.name,
          kind: source.kind,
          environment: source.environment,
          formatHint: source.format_hint ?? source.formatHint ?? "",
          changePattern: source.change_pattern ?? source.changePattern ?? "snapshot"
        }))
      }
    }))
  };
}

function normalizeMomoResponse(input: any): AgentMomoResponse {
  return {
    assistant: input.assistant ?? "agent-momo",
    answer: input.answer,
    brief: input.brief ?? "",
    retrievalBackend: input.retrieval_backend ?? input.retrievalBackend,
    sources: (input.sources ?? []).map((source: any) => ({
      id: source.id,
      title: source.title,
      kind: source.kind,
      score: source.score,
      snippet: source.snippet,
      tags: source.tags ?? []
    }))
  };
}

export async function getRepos() {
  try {
    return (await client.listRepos()).map(normalizeRepo);
  } catch (error) {
    throw new Error(formatApiError(error, "Could not load repositories from the control plane."));
  }
}

export async function getRepoTree(repoId: string) {
  try {
    const response = await client.getRepoTree(repoId);
    return normalizeTree(response.tree);
  } catch (error) {
    throw new Error(formatApiError(error, "Could not load the repository tree from the control plane."));
  }
}

export async function getPipelines() {
  try {
    return (await client.listPipelines()).map(normalizePipeline);
  } catch (error) {
    throw new Error(formatApiError(error, "Could not load pipelines from the control plane."));
  }
}

export async function getPipeline(id: string) {
  try {
    return normalizePipeline(await client.getPipeline(id));
  } catch (error) {
    throw new Error(formatApiError(error, `Could not load pipeline ${id} from the control plane.`));
  }
}

export async function savePipeline(pipeline: PipelineRecord) {
  try {
    const saved = await client.updatePipeline(pipeline.id, pipeline);
    return normalizePipeline(saved);
  } catch (error) {
    throw new Error(formatApiError(error, `Could not save pipeline ${pipeline.id}.`));
  }
}

export async function validatePipeline(id: string) {
  try {
    return await client.validatePipeline(id);
  } catch (error) {
    throw new Error(formatApiError(error, `Could not validate pipeline ${id}.`));
  }
}

export async function publishPipeline(id: string) {
  try {
    return normalizePipeline(await client.publishPipeline(id));
  } catch (error) {
    throw new Error(formatApiError(error, `Could not publish pipeline ${id}.`));
  }
}

export async function runPipeline(id: string) {
  try {
    return normalizeRun(await client.runPipeline(id));
  } catch (error) {
    throw new Error(formatApiError(error, `Could not create a run for pipeline ${id}.`));
  }
}

export async function getPipelineRuns(id: string) {
  try {
    return (await client.listPipelineRuns(id)).map(normalizeRun);
  } catch (error) {
    throw new Error(formatApiError(error, `Could not load runs for pipeline ${id}.`));
  }
}

export async function getRun(id: string) {
  try {
    return normalizeRun(await client.getRun(id));
  } catch (error) {
    throw new Error(formatApiError(error, `Could not load run ${id}.`));
  }
}

export async function getRunLogs(id: string): Promise<RunLog[]> {
  try {
    return (await client.getRunLogs(id)).map((log: any) => ({
      id: log.id,
      runId: log.run_id ?? log.runId,
      taskRunId: log.task_run_id ?? log.taskRunId ?? null,
      level: log.level,
      message: log.message,
      timestamp: log.timestamp
    }));
  } catch (error) {
    throw new Error(formatApiError(error, `Could not load logs for run ${id}.`));
  }
}

export async function getPipelineIntents(): Promise<NoodlePipelineIntentCatalogResponse> {
  try {
    return normalizePipelineIntentCatalog(await requestJson("/noodle/pipeline-intents"));
  } catch (error) {
    throw new Error(formatApiError(error, "Could not load pipeline intents for the designer."));
  }
}

export async function queryDesignerMomo(payload: AgentMomoApiPayload): Promise<AgentMomoResponse> {
  try {
    return normalizeMomoResponse(
      await requestJson("/noodle/designer/momo/query", {
        method: "POST",
        body: JSON.stringify(payload)
      })
    );
  } catch (error) {
    throw new Error(formatApiError(error, "Agent Momo could not answer from the current pipeline context."));
  }
}
