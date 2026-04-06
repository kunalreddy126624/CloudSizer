from __future__ import annotations

from datetime import datetime

from app.schemas.common import APIModel, TimestampedModel


class PipelineRunRead(TimestampedModel):
    id: str
    pipeline_id: str
    version: int
    state: str
    trigger: str
    started_at: str | None
    finished_at: str | None


class TaskRunRead(TimestampedModel):
    id: str
    pipeline_run_id: str
    node_id: str
    node_name: str
    state: str
    started_at: str | None
    finished_at: str | None


class RunLogRead(APIModel):
    id: str
    run_id: str
    task_run_id: str | None
    level: str
    message: str
    timestamp: datetime
