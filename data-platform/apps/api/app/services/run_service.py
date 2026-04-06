from __future__ import annotations

from datetime import UTC, datetime

from app.execution.compiler import ExecutionPlanCompiler
from app.execution.dispatcher import MockTaskDispatcher
from app.execution.mock_runner import MockManualRunner
from app.execution.scheduler import ManualScheduler
from app.repositories.pipeline_repository import PipelineRepository
from app.repositories.run_repository import RunRepository
from app.schemas.pipeline import PipelineSpec
from app.schemas.run import PipelineRunRead, RunLogRead, TaskRunRead


def _run_to_read(run) -> PipelineRunRead:
    return PipelineRunRead.model_validate(run)


def _task_to_read(task) -> TaskRunRead:
    return TaskRunRead.model_validate(task)


class RunService:
    def __init__(self, pipeline_repository: PipelineRepository, run_repository: RunRepository) -> None:
        self.pipeline_repository = pipeline_repository
        self.run_repository = run_repository
        self.runner = MockManualRunner(
            run_repository=run_repository,
            compiler=ExecutionPlanCompiler(),
            scheduler=ManualScheduler(),
            dispatcher=MockTaskDispatcher(),
        )

    def create_run(self, pipeline_id: str) -> PipelineRunRead:
        pipeline = self.pipeline_repository.get_pipeline(pipeline_id)
        if pipeline is None:
            raise ValueError("Pipeline not found")

        spec = PipelineSpec.model_validate(pipeline.spec_json)
        run = self.runner.start(
            pipeline_id=pipeline.id,
            version=pipeline.current_version,
            trigger=spec.schedule.mode,
            spec=spec,
        )
        return _run_to_read(run)

    def list_runs(self, pipeline_id: str) -> list[PipelineRunRead]:
        return [_run_to_read(run) for run in self.run_repository.list_runs_for_pipeline(pipeline_id)]

    def get_run(self, run_id: str) -> PipelineRunRead:
        run = self.run_repository.get_run(run_id)
        if run is None:
            raise ValueError("Run not found")
        return _run_to_read(run)

    def list_tasks(self, run_id: str) -> list[TaskRunRead]:
        if self.run_repository.get_run(run_id) is None:
            raise ValueError("Run not found")
        return [_task_to_read(task) for task in self.run_repository.list_tasks_for_run(run_id)]

    def list_logs(self, run_id: str) -> list[RunLogRead]:
        run = self.run_repository.get_run(run_id)
        if run is None:
            raise ValueError("Run not found")

        timestamp = datetime.now(UTC)
        tasks = self.run_repository.list_tasks_for_run(run_id)
        logs = [
            RunLogRead(
                id=f"log_{run_id}_boot",
                run_id=run_id,
                task_run_id=None,
                level="info",
                message=f"Run {run_id} entered state {run.state}.",
                timestamp=timestamp,
            )
        ]
        for task in tasks:
            logs.append(
                RunLogRead(
                    id=f"log_{task.id}",
                    run_id=run_id,
                    task_run_id=task.id,
                    level="log",
                    message=f"Task {task.node_name} finished with state {task.state}.",
                    timestamp=timestamp,
                )
            )
        if run.state == "success":
            logs.append(
                RunLogRead(
                    id=f"log_{run_id}_warn",
                    run_id=run_id,
                    task_run_id=None,
                    level="warn",
                    message="Mock runner completed locally; connect Airflow or Prefect for distributed execution.",
                    timestamp=timestamp,
                )
            )
        return logs

    def cancel_run(self, run_id: str) -> PipelineRunRead:
        run = self.run_repository.get_run(run_id)
        if run is None:
            raise ValueError("Run not found")
        run.state = "cancelled"
        run.finished_at = datetime.now(UTC).isoformat()
        self.run_repository.update_run(run)
        return _run_to_read(run)

    def retry_task(self, task_run_id: str) -> TaskRunRead:
        task = self.run_repository.get_task_run(task_run_id)
        if task is None:
            raise ValueError("Task run not found")
        task.state = "retrying"
        self.run_repository.update_task_run(task)
        task.state = "success"
        task.finished_at = datetime.now(UTC).isoformat()
        self.run_repository.update_task_run(task)
        return _task_to_read(task)
