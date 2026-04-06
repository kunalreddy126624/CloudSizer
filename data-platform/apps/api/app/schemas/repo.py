from __future__ import annotations

from pydantic import Field

from app.schemas.common import APIModel, TimestampedModel


class RepoCreate(APIModel):
    workspace_id: str
    name: str
    slug: str
    description: str = ""
    root_path: str


class RepoRead(TimestampedModel):
    id: str
    workspace_id: str
    name: str
    slug: str
    description: str
    root_path: str


class ArtifactTreeNode(APIModel):
    id: str
    name: str
    path: str
    kind: str
    artifact_type: str | None = None
    children: list["ArtifactTreeNode"] = Field(default_factory=list)


class ArtifactCreate(APIModel):
    parent_path: str
    name: str
    artifact_type: str
    content: str
    metadata: dict = Field(default_factory=dict)


class ArtifactUpdate(APIModel):
    name: str
    parent_path: str
    path: str
    content: str
    metadata: dict = Field(default_factory=dict)
    publish_state: str = "draft"


class ArtifactRead(TimestampedModel):
    id: str
    repo_id: str
    parent_path: str
    name: str
    path: str
    artifact_type: str
    publish_state: str
    latest_version: int


class ArtifactVersionRead(TimestampedModel):
    id: str
    artifact_id: str
    version: int
    content: str
    metadata: dict
    publish_state: str


class RepoTreeResponse(APIModel):
    repo: RepoRead
    tree: ArtifactTreeNode


class PublishArtifactResponse(APIModel):
    artifact_id: str
    publish_state: str


ArtifactTreeNode.model_rebuild()
