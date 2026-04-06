from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import PipelineRun, TaskRun


class RunRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_run(self, run: PipelineRun) -> PipelineRun:
        self.session.add(run)
        self.session.commit()
        self.session.refresh(run)
        return run

    def update_run(self, run: PipelineRun) -> PipelineRun:
        self.session.add(run)
        self.session.commit()
        self.session.refresh(run)
        return run

    def get_run(self, run_id: str) -> PipelineRun | None:
        return self.session.get(PipelineRun, run_id)

    def list_runs_for_pipeline(self, pipeline_id: str) -> list[PipelineRun]:
        stmt = select(PipelineRun).where(PipelineRun.pipeline_id == pipeline_id).order_by(PipelineRun.created_at.desc())
        return list(self.session.scalars(stmt))

    def create_task_runs(self, task_runs: list[TaskRun]) -> list[TaskRun]:
        self.session.add_all(task_runs)
        self.session.commit()
        for task_run in task_runs:
            self.session.refresh(task_run)
        return task_runs

    def update_task_run(self, task_run: TaskRun) -> TaskRun:
        self.session.add(task_run)
        self.session.commit()
        self.session.refresh(task_run)
        return task_run

    def get_task_run(self, task_run_id: str) -> TaskRun | None:
        return self.session.get(TaskRun, task_run_id)

    def list_tasks_for_run(self, run_id: str) -> list[TaskRun]:
        stmt = select(TaskRun).where(TaskRun.pipeline_run_id == run_id).order_by(TaskRun.created_at.asc())
        return list(self.session.scalars(stmt))
