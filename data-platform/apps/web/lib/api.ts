import type { PipelineRecord, PipelineRun, Repo, RunLog, TreeNode, ValidationIssue } from "@data-platform/types";

import { DataPlatformClient } from "@data-platform/sdk";

const client = new DataPlatformClient(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000");

function formatApiError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
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
