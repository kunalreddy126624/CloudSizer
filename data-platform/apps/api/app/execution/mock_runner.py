from __future__ import annotations

from datetime import UTC, datetime

from app.execution.compiler import ExecutionPlanCompiler
from app.execution.dispatcher import MockTaskDispatcher
from app.execution.scheduler import ManualScheduler
from app.models.entities import PipelineRun, TaskRun
from app.repositories.run_repository import RunRepository
from app.schemas.pipeline import PipelineSpec


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


class MockManualRunner:
    def __init__(
        self,
        run_repository: RunRepository,
        compiler: ExecutionPlanCompiler,
        scheduler: ManualScheduler,
        dispatcher: MockTaskDispatcher,
    ) -> None:
        self.run_repository = run_repository
        self.compiler = compiler
        self.scheduler = scheduler
        self.dispatcher = dispatcher

    def start(self, pipeline_id: str, version: int, trigger: str, spec: PipelineSpec) -> PipelineRun:
        run = PipelineRun(
            id=f"run_{pipeline_id}_{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}",
            pipeline_id=pipeline_id,
            version=version,
            state="queued",
            trigger=trigger,
            started_at=None,
            finished_at=None,
        )
        run = self.run_repository.create_run(run)

        plan = self.compiler.compile(spec)
        self.scheduler.queue_run(plan)
        task_runs: list[TaskRun] = []
        for task in plan["tasks"]:
            self.dispatcher.dispatch(task)
            task_runs.append(
                TaskRun(
                    id=f"task_{run.id}_{task['nodeId']}",
                    pipeline_run_id=run.id,
                    node_id=task["nodeId"],
                    node_name=task["nodeName"],
                    state="pending",
                    started_at=None,
                    finished_at=None,
                )
            )
        self.run_repository.create_task_runs(task_runs)

        run.state = "running"
        run.started_at = utc_now()
        self.run_repository.update_run(run)

        for index, task_run in enumerate(self.run_repository.list_tasks_for_run(run.id)):
            task_run.state = "running"
            task_run.started_at = utc_now()
            self.run_repository.update_task_run(task_run)

            task_run.state = "success"
            task_run.finished_at = utc_now()
            self.run_repository.update_task_run(task_run)

            if index == len(task_runs) - 1:
                run.state = "success"
                run.finished_at = utc_now()
                self.run_repository.update_run(run)

        return run
