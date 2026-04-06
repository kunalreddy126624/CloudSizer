from __future__ import annotations

from typing import Protocol


class TaskDispatcher(Protocol):
    def dispatch(self, task: dict) -> dict: ...


class MockTaskDispatcher:
    def dispatch(self, task: dict) -> dict:
        return {"taskId": task["nodeId"], "status": "dispatched"}
