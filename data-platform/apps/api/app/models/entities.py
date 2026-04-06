from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin


class Workspace(TimestampMixin, Base):
    __tablename__ = "workspaces"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)


class Membership(TimestampMixin, Base):
    __tablename__ = "memberships"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)


class Repo(TimestampMixin, Base):
    __tablename__ = "repos"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    root_path: Mapped[str] = mapped_column(String(255), nullable=False)
    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="repo")


class Artifact(TimestampMixin, Base):
    __tablename__ = "artifacts"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    repo_id: Mapped[str] = mapped_column(ForeignKey("repos.id"), nullable=False)
    parent_path: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    artifact_type: Mapped[str] = mapped_column(String(32), nullable=False)
    publish_state: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    latest_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    repo: Mapped["Repo"] = relationship(back_populates="artifacts")
    versions: Mapped[list["ArtifactVersion"]] = relationship(back_populates="artifact", cascade="all, delete-orphan")


class ArtifactVersion(TimestampMixin, Base):
    __tablename__ = "artifact_versions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    artifact_id: Mapped[str] = mapped_column(ForeignKey("artifacts.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    publish_state: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    artifact: Mapped["Artifact"] = relationship(back_populates="versions")


class Pipeline(TimestampMixin, Base):
    __tablename__ = "pipelines"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    artifact_id: Mapped[str] = mapped_column(ForeignKey("artifacts.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    publish_state: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    spec_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class PipelineVersion(TimestampMixin, Base):
    __tablename__ = "pipeline_versions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pipeline_id: Mapped[str] = mapped_column(ForeignKey("pipelines.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    publish_state: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    spec_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class PipelineRun(TimestampMixin, Base):
    __tablename__ = "pipeline_runs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pipeline_id: Mapped[str] = mapped_column(ForeignKey("pipelines.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    trigger: Mapped[str] = mapped_column(String(32), nullable=False)
    started_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    finished_at: Mapped[str | None] = mapped_column(String(64), nullable=True)


class TaskRun(TimestampMixin, Base):
    __tablename__ = "task_runs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pipeline_run_id: Mapped[str] = mapped_column(ForeignKey("pipeline_runs.id"), nullable=False)
    node_id: Mapped[str] = mapped_column(String(120), nullable=False)
    node_name: Mapped[str] = mapped_column(String(255), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    started_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    finished_at: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Connection(TimestampMixin, Base):
    __tablename__ = "connections"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    connection_type: Mapped[str] = mapped_column(String(64), nullable=False)
    config_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class Environment(TimestampMixin, Base):
    __tablename__ = "environments"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    slug: Mapped[str] = mapped_column(String(120), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Schedule(TimestampMixin, Base):
    __tablename__ = "schedules"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    pipeline_id: Mapped[str] = mapped_column(ForeignKey("pipelines.id"), nullable=False)
    mode: Mapped[str] = mapped_column(String(32), nullable=False)
    cron: Mapped[str | None] = mapped_column(String(128), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)


class Secret(TimestampMixin, Base):
    __tablename__ = "secrets"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    environment_id: Mapped[str] = mapped_column(ForeignKey("environments.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
