from __future__ import annotations

from app.noodle.config import NoodleSettings
from app.noodle.schemas import NoodlePipelineIntent


class WorkflowTemplateService:
    def __init__(self, settings: NoodleSettings) -> None:
        self.settings = settings

    def choose_template(self, intent: NoodlePipelineIntent) -> str:
        if intent.requires_realtime_serving and intent.latency_slo == "seconds":
            return f"{self.settings.workflow_backend}-event-driven-realtime"
        if intent.requires_realtime_serving:
            return f"{self.settings.workflow_backend}-hybrid-streaming"
        if intent.requires_ml_features:
            return f"{self.settings.workflow_backend}-batch-plus-feature-materialization"
        return f"{self.settings.workflow_backend}-standard-batch-orchestration"

    def stack(self) -> list[str]:
        return [self.settings.workflow_backend, self.settings.event_backbone, "connector-runtime", "execution-workers"]

