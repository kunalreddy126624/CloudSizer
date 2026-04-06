from __future__ import annotations

from pydantic import Field

from app.schemas.common import APIModel, TimestampedModel


class RetryPolicy(APIModel):
    retries: int
    backoffSeconds: int


class TimeoutPolicy(APIModel):
    executionSeconds: int


class ResourceHints(APIModel):
    cpu: str
    memory: str
    pool: str | None = None


class PipelineNode(APIModel):
    id: str
    type: str
    name: str
    description: str
    category: str
    position: dict[str, float]
    config: dict
    retry: RetryPolicy
    timeout: TimeoutPolicy
    resources: ResourceHints
    tags: list[str] = Field(default_factory=list)


class PipelineEdge(APIModel):
    id: str
    source: str
    target: str


class PipelineSchedule(APIModel):
    mode: str
    cron: str | None = None
    timezone: str | None = None


class PipelineDefaults(APIModel):
    retry: RetryPolicy
    timeout: TimeoutPolicy
    resources: ResourceHints


class PipelineMetadata(APIModel):
    owner: str
    labels: dict[str, str] = Field(default_factory=dict)
    repoPath: str


class PipelineSpec(APIModel):
    pipelineId: str
    name: str
    description: str
    version: int
    schedule: PipelineSchedule
    defaults: PipelineDefaults
    nodes: list[PipelineNode]
    edges: list[PipelineEdge]
    metadata: PipelineMetadata


class ValidationIssue(APIModel):
    code: str
    message: str
    severity: str
    nodeId: str | None = None
    edgeId: str | None = None


class PipelineRead(TimestampedModel):
    id: str
    artifact_id: str
    name: str
    description: str
    publish_state: str
    current_version: int
    spec: PipelineSpec


class PipelineCreate(APIModel):
    artifact_id: str
    name: str
    description: str
    publish_state: str = "draft"
    current_version: int = 1
    spec: PipelineSpec


class PipelineUpdate(APIModel):
    name: str
    description: str
    spec: PipelineSpec

