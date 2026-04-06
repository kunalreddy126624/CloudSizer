from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import Artifact, ArtifactVersion, Repo


class RepoRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_repos(self) -> list[Repo]:
        return list(self.session.scalars(select(Repo).order_by(Repo.created_at.desc())))

    def get_repo(self, repo_id: str) -> Repo | None:
        return self.session.get(Repo, repo_id)

    def create_repo(self, repo: Repo) -> Repo:
        self.session.add(repo)
        self.session.commit()
        self.session.refresh(repo)
        return repo

    def list_artifacts_for_repo(self, repo_id: str) -> list[Artifact]:
        stmt = select(Artifact).where(Artifact.repo_id == repo_id).order_by(Artifact.path.asc())
        return list(self.session.scalars(stmt))

    def create_artifact(self, artifact: Artifact, version: ArtifactVersion) -> Artifact:
        self.session.add(artifact)
        self.session.add(version)
        self.session.commit()
        self.session.refresh(artifact)
        return artifact

    def get_artifact(self, artifact_id: str) -> Artifact | None:
        return self.session.get(Artifact, artifact_id)

    def update_artifact(self, artifact: Artifact) -> Artifact:
        self.session.add(artifact)
        self.session.commit()
        self.session.refresh(artifact)
        return artifact

    def list_artifact_versions(self, artifact_id: str) -> list[ArtifactVersion]:
        stmt = select(ArtifactVersion).where(ArtifactVersion.artifact_id == artifact_id).order_by(ArtifactVersion.version.desc())
        return list(self.session.scalars(stmt))

    def create_artifact_version(self, version: ArtifactVersion) -> ArtifactVersion:
        self.session.add(version)
        self.session.commit()
        self.session.refresh(version)
        return version
