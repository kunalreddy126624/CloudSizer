from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class NoodleSettings:
    environment: str
    workflow_backend: str
    event_backbone: str
    metadata_backend: str
    lakehouse_format: str
    serving_api_base: str
    llm_provider: str


def get_noodle_settings() -> NoodleSettings:
    return NoodleSettings(
        environment=os.getenv("NOODLE_ENVIRONMENT", "development"),
        workflow_backend=os.getenv("NOODLE_WORKFLOW_BACKEND", "temporal"),
        event_backbone=os.getenv("NOODLE_EVENT_BACKBONE", "kafka"),
        metadata_backend=os.getenv("NOODLE_METADATA_BACKEND", "datahub"),
        lakehouse_format=os.getenv("NOODLE_LAKEHOUSE_FORMAT", "iceberg"),
        serving_api_base=os.getenv("NOODLE_SERVING_API_BASE", "/noodle"),
        llm_provider=os.getenv("NOODLE_LLM_PROVIDER", "openai-compatible-gateway"),
    )

