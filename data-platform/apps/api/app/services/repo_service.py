from __future__ import annotations

import json
import uuid

from app.models.entities import Artifact, ArtifactVersion, Repo
from app.repositories.repo_repository import RepoRepository
from app.schemas.repo import (
    ArtifactCreate,
    ArtifactRead,
    ArtifactTreeNode,
    ArtifactUpdate,
    ArtifactVersionRead,
    PublishArtifactResponse,
    RepoCreate,
    RepoRead,
    RepoTreeResponse,
)


def _repo_to_read(repo: Repo) -> RepoRead:
    return RepoRead.model_validate(repo)


def _artifact_to_read(artifact: Artifact) -> ArtifactRead:
    return ArtifactRead.model_validate(artifact)


def _version_to_read(version: ArtifactVersion) -> ArtifactVersionRead:
    return ArtifactVersionRead(
        id=version.id,
        artifact_id=version.artifact_id,
        version=version.version,
        content=version.content,
        metadata=version.metadata_json,
        publish_state=version.publish_state,
        created_at=version.created_at,
        updated_at=version.updated_at,
    )


class RepoService:
    def __init__(self, repository: RepoRepository) -> None:
        self.repository = repository

    def list_repos(self) -> list[RepoRead]:
        return [_repo_to_read(repo) for repo in self.repository.list_repos()]

    def create_repo(self, payload: RepoCreate) -> RepoRead:
        repo = Repo(
            id=f"repo_{uuid.uuid4().hex[:12]}",
            workspace_id=payload.workspace_id,
            name=payload.name,
            slug=payload.slug,
            description=payload.description,
            root_path=payload.root_path,
        )
        return _repo_to_read(self.repository.create_repo(repo))

    def get_repo_tree(self, repo_id: str) -> RepoTreeResponse:
        repo = self.repository.get_repo(repo_id)
        if repo is None:
            raise ValueError("Repository not found")

        nodes: dict[str, ArtifactTreeNode] = {
            "": ArtifactTreeNode(id=f"{repo.id}:root", name=repo.name, path=repo.root_path, kind="folder", children=[])
        }
        artifacts = self.repository.list_artifacts_for_repo(repo_id)

        for artifact in artifacts:
            parent_path = artifact.parent_path.strip("/")
            current_parts = [part for part in parent_path.split("/") if part]
            cumulative = ""
            for part in current_parts:
                next_path = f"{cumulative}/{part}".strip("/")
                if next_path not in nodes:
                    nodes[next_path] = ArtifactTreeNode(
                        id=f"{repo.id}:folder:{next_path}",
                        name=part,
                        path=f"{repo.root_path}/{next_path}".replace("//", "/"),
                        kind="folder",
                        children=[],
                    )
                    parent_key = cumulative
                    nodes[parent_key].children.append(nodes[next_path])
                cumulative = next_path

            parent_key = parent_path
            nodes[parent_key].children.append(
                ArtifactTreeNode(
                    id=artifact.id,
                    name=artifact.name,
                    path=artifact.path,
                    kind="artifact",
                    artifact_type=artifact.artifact_type,
                )
            )

        return RepoTreeResponse(repo=_repo_to_read(repo), tree=nodes[""])

    def create_artifact(self, repo_id: str, payload: ArtifactCreate) -> ArtifactRead:
        repo = self.repository.get_repo(repo_id)
        if repo is None:
            raise ValueError("Repository not found")

        artifact = Artifact(
            id=f"art_{uuid.uuid4().hex[:12]}",
            repo_id=repo_id,
            parent_path=payload.parent_path,
            name=payload.name,
            path=f"{repo.root_path}/{payload.parent_path}/{payload.name}".replace("//", "/"),
            artifact_type=payload.artifact_type,
            publish_state="draft",
            latest_version=1,
        )
        version = ArtifactVersion(
            id=f"arv_{uuid.uuid4().hex[:12]}",
            artifact_id=artifact.id,
            version=1,
            content=payload.content,
            metadata_json=payload.metadata,
            publish_state="draft",
        )
        return _artifact_to_read(self.repository.create_artifact(artifact, version))

    def get_artifact(self, artifact_id: str) -> ArtifactRead:
        artifact = self.repository.get_artifact(artifact_id)
        if artifact is None:
            raise ValueError("Artifact not found")
        return _artifact_to_read(artifact)

    def update_artifact(self, artifact_id: str, payload: ArtifactUpdate) -> ArtifactRead:
        artifact = self.repository.get_artifact(artifact_id)
        if artifact is None:
            raise ValueError("Artifact not found")

        artifact.name = payload.name
        artifact.parent_path = payload.parent_path
        artifact.path = payload.path
        artifact.publish_state = payload.publish_state
        artifact.latest_version += 1
        self.repository.update_artifact(artifact)

        version = ArtifactVersion(
            id=f"arv_{uuid.uuid4().hex[:12]}",
            artifact_id=artifact.id,
            version=artifact.latest_version,
            content=payload.content,
            metadata_json=payload.metadata,
            publish_state=payload.publish_state,
        )
        self.repository.create_artifact_version(version)
        return _artifact_to_read(artifact)

    def list_artifact_versions(self, artifact_id: str) -> list[ArtifactVersionRead]:
        if self.repository.get_artifact(artifact_id) is None:
            raise ValueError("Artifact not found")
        return [_version_to_read(version) for version in self.repository.list_artifact_versions(artifact_id)]

    def publish_artifact(self, artifact_id: str) -> PublishArtifactResponse:
        artifact = self.repository.get_artifact(artifact_id)
        if artifact is None:
            raise ValueError("Artifact not found")

        artifact.publish_state = "published"
        self.repository.update_artifact(artifact)
        versions = self.repository.list_artifact_versions(artifact.id)
        if versions:
            latest = versions[0]
            self.repository.create_artifact_version(
                ArtifactVersion(
                    id=f"arv_{uuid.uuid4().hex[:12]}",
                    artifact_id=latest.artifact_id,
                    version=artifact.latest_version + 1,
                    content=latest.content,
                    metadata_json=json.loads(json.dumps(latest.metadata_json)),
                    publish_state="published",
                )
            )
            artifact.latest_version += 1
            self.repository.update_artifact(artifact)

        return PublishArtifactResponse(artifact_id=artifact.id, publish_state=artifact.publish_state)
