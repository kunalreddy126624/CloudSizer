import type {
  Artifact,
  ArtifactVersion,
  PipelineRecord,
  PipelineRun,
  Repo,
  RunLog,
  TaskRun,
  TreeNode,
  ValidationIssue
} from "@data-platform/types";

export interface CreateRepoRequest {
  workspaceId: string;
  name: string;
  slug: string;
  description: string;
  rootPath: string;
}

export interface CreateArtifactRequest {
  parentPath: string;
  name: string;
  artifactType: Artifact["artifactType"];
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RepoTreeResponse {
  repo: Repo;
  tree: TreeNode;
}

export class DataPlatformClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(path: string, init?: RequestInit) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return (await response.json()) as T;
  }

  listRepos() {
    return this.request<Repo[]>("/repos");
  }

  createRepo(payload: CreateRepoRequest) {
    return this.request<Repo>("/repos", {
      method: "POST",
      body: JSON.stringify({
        workspace_id: payload.workspaceId,
        name: payload.name,
        slug: payload.slug,
        description: payload.description,
        root_path: payload.rootPath
      })
    });
  }

  getRepoTree(repoId: string) {
    return this.request<RepoTreeResponse>(`/repos/${repoId}/tree`);
  }

  createArtifact(repoId: string, payload: CreateArtifactRequest) {
    return this.request<Artifact>(`/repos/${repoId}/artifacts`, {
      method: "POST",
      body: JSON.stringify({
        parent_path: payload.parentPath,
        name: payload.name,
        artifact_type: payload.artifactType,
        content: payload.content,
        metadata: payload.metadata ?? {}
      })
    });
  }

  getArtifact(artifactId: string) {
    return this.request<Artifact>(`/artifacts/${artifactId}`);
  }

  updateArtifact(
    artifactId: string,
    payload: { name: string; parentPath: string; path: string; content: string; metadata?: Record<string, unknown>; publishState: string }
  ) {
    return this.request<Artifact>(`/artifacts/${artifactId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: payload.name,
        parent_path: payload.parentPath,
        path: payload.path,
        content: payload.content,
        metadata: payload.metadata ?? {},
        publish_state: payload.publishState
      })
    });
  }

  getArtifactVersions(artifactId: string) {
    return this.request<ArtifactVersion[]>(`/artifacts/${artifactId}/versions`);
  }

  publishArtifact(artifactId: string) {
    return this.request<Artifact>(`/artifacts/${artifactId}/publish`, { method: "POST" });
  }

  listPipelines() {
    return this.request<PipelineRecord[]>("/pipelines");
  }

  getPipeline(id: string) {
    return this.request<PipelineRecord>(`/pipelines/${id}`);
  }

  createPipeline(payload: PipelineRecord) {
    return this.request<PipelineRecord>("/pipelines", {
      method: "POST",
      body: JSON.stringify({
        artifact_id: payload.artifactId,
        name: payload.name,
        description: payload.description,
        publish_state: payload.publishState,
        current_version: payload.currentVersion,
        spec: payload.spec
      })
    });
  }

  updatePipeline(id: string, payload: PipelineRecord) {
    return this.request<PipelineRecord>(`/pipelines/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        spec: payload.spec
      })
    });
  }

  validatePipeline(id: string) {
    return this.request<ValidationIssue[]>(`/pipelines/${id}/validate`, { method: "POST" });
  }

  publishPipeline(id: string) {
    return this.request<PipelineRecord>(`/pipelines/${id}/publish`, { method: "POST" });
  }

  runPipeline(id: string) {
    return this.request<PipelineRun>(`/pipelines/${id}/run`, { method: "POST" });
  }

  listPipelineRuns(id: string) {
    return this.request<PipelineRun[]>(`/pipelines/${id}/runs`);
  }

  getRun(id: string) {
    return this.request<PipelineRun>(`/runs/${id}`);
  }

  getRunTasks(id: string) {
    return this.request<TaskRun[]>(`/runs/${id}/tasks`);
  }

  getRunLogs(id: string) {
    return this.request<RunLog[]>(`/runs/${id}/logs`);
  }
}
