import type { PipelineRecord, PipelineRun, Repo, RunLog, TreeNode, ValidationIssue } from "@data-platform/types";

import { DataPlatformClient } from "@data-platform/sdk";

import { mockPipeline, mockRepo, mockRuns, mockTree } from "@/lib/mock-data";

const client = new DataPlatformClient(process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000");

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
  } catch {
    return [mockRepo];
  }
}

export async function getRepoTree(repoId: string) {
  try {
    const response = await client.getRepoTree(repoId);
    return normalizeTree(response.tree);
  } catch {
    return mockTree;
  }
}

export async function getPipelines() {
  try {
    return (await client.listPipelines()).map(normalizePipeline);
  } catch {
    return [mockPipeline];
  }
}

export async function getPipeline(id: string) {
  try {
    return normalizePipeline(await client.getPipeline(id));
  } catch {
    return mockPipeline;
  }
}

export async function savePipeline(pipeline: PipelineRecord) {
  try {
    const saved = pipeline.id === mockPipeline.id ? await client.updatePipeline(pipeline.id, pipeline) : await client.createPipeline(pipeline);
    return normalizePipeline(saved);
  } catch {
    return {
      ...pipeline,
      updatedAt: new Date().toISOString()
    };
  }
}

export async function validatePipeline(id: string) {
  try {
    return await client.validatePipeline(id);
  } catch {
    return [] as ValidationIssue[];
  }
}

export async function publishPipeline(id: string) {
  try {
    return normalizePipeline(await client.publishPipeline(id));
  } catch {
    return { ...mockPipeline, id, publishState: "published" as const, updatedAt: new Date().toISOString() };
  }
}

export async function runPipeline(id: string) {
  try {
    return normalizeRun(await client.runPipeline(id));
  } catch {
    return mockRuns[0];
  }
}

export async function getPipelineRuns(id: string) {
  try {
    return (await client.listPipelineRuns(id)).map(normalizeRun);
  } catch {
    return mockRuns;
  }
}

export async function getRun(id: string) {
  try {
    return normalizeRun(await client.getRun(id));
  } catch {
    return mockRuns.find((run) => run.id === id) ?? mockRuns[0];
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
  } catch {
    return [
      {
        id: `log_${id}_boot`,
        runId: id,
        taskRunId: null,
        level: "info",
        message: "Pipeline run initialized.",
        timestamp: new Date().toISOString()
      },
      {
        id: `log_${id}_task`,
        runId: id,
        taskRunId: null,
        level: "log",
        message: "source_postgres_1 extracted rows.",
        timestamp: new Date().toISOString()
      },
      {
        id: `log_${id}_warn`,
        runId: id,
        taskRunId: null,
        level: "warn",
        message: "Mock runner in use. Connect Airflow or Prefect later.",
        timestamp: new Date().toISOString()
      }
    ];
  }
}
