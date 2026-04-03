from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from uuid import uuid4

from app.noodle.repository import NoodlePipelineRepository
from app.noodle.schemas import (
    NoodleDesignerRun,
    NoodleDesignerRunLog,
    NoodleDesignerRunTask,
    NoodlePipelineDocument,
    NoodlePipelineRunCreateRequest,
    NoodlePipelineRunResponse,
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_log(level: str, message: str, node_id: str | None = None) -> NoodleDesignerRunLog:
    return NoodleDesignerRunLog(
        id=f"run-log-{uuid4().hex[:10]}",
        timestamp=_utc_now(),
        level=level,
        message=message,
        node_id=node_id,
    )


class NoodlePipelineControlPlaneService:
    def __init__(self, repository: NoodlePipelineRepository | None = None) -> None:
        self.repository = repository or NoodlePipelineRepository()

    def list_pipelines(self) -> list[NoodlePipelineDocument]:
        return self.repository.list_pipelines()

    def get_pipeline(self, pipeline_id: str) -> NoodlePipelineDocument | None:
        return self.repository.get_pipeline(pipeline_id)

    def save_pipeline(self, document: NoodlePipelineDocument) -> NoodlePipelineDocument:
        normalized = document.model_copy(update={"saved_at": _utc_now()})
        return self.repository.save_pipeline(normalized)

    def create_run(self, pipeline_id: str, request: NoodlePipelineRunCreateRequest) -> NoodlePipelineRunResponse:
        existing = self.repository.get_pipeline(pipeline_id)

        if existing is None:
            if request.document is None:
                raise KeyError(pipeline_id)
            existing = self.save_pipeline(request.document)
        elif request.document is not None:
            existing = self.save_pipeline(request.document.model_copy(update={"id": pipeline_id}))

        run_started_at = _utc_now()
        blocking_issue = existing.status != "published"
        task_runs = []
        for index, node in enumerate(existing.nodes):
            if blocking_issue:
                state = "failed" if index == 0 else "skipped"
            else:
                state = "running" if index == 0 else "queued"
            task_runs.append(
                NoodleDesignerRunTask(
                    id=f"task-run-{uuid4().hex[:10]}",
                    node_id=node.id,
                    node_label=node.label,
                    state=state,
                    started_at=run_started_at if index == 0 else None,
                    finished_at=run_started_at if blocking_issue and index == 0 else None,
                )
            )

        run = NoodleDesignerRun(
            id=f"run-{uuid4().hex[:10]}",
            label="Manual Airflow run" if request.trigger == "manual" else f"{request.trigger.title()} Airflow run",
            orchestrator="Apache Airflow",
            status="failed" if blocking_issue else "running",
            trigger=request.trigger,
            started_at=run_started_at,
            finished_at=run_started_at if blocking_issue else None,
            task_runs=task_runs,
            logs=[
                _run_log("log", "Apache Airflow DAG compiled from the saved JSON pipeline spec."),
                _run_log("info", f"Run started for pipeline version {existing.version}."),
                _run_log(
                    "warn",
                    "Run stopped because only published pipeline versions can execute."
                    if blocking_issue
                    else "Downstream tasks are waiting for upstream success before scheduling."
                ),
            ],
        )

        next_document = existing.model_copy(update={"runs": [run, *existing.runs], "saved_at": _utc_now()})
        saved = self.repository.save_pipeline(next_document)
        return NoodlePipelineRunResponse(pipeline=saved, run=run)


@lru_cache(maxsize=1)
def get_noodle_pipeline_control_plane() -> NoodlePipelineControlPlaneService:
    return NoodlePipelineControlPlaneService()
