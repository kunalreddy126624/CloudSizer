from __future__ import annotations

from typing import Protocol


class Scheduler(Protocol):
    def queue_run(self, execution_plan: dict) -> str: ...


class ManualScheduler:
    def queue_run(self, execution_plan: dict) -> str:
        return f"queued:{execution_plan['pipelineId']}"
