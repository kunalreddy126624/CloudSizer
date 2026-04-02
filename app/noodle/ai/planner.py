from __future__ import annotations

from app.noodle.config import NoodleSettings
from app.noodle.schemas import NoodleAiCapability, NoodlePipelineIntent


class NoodleAiPlannerService:
    def __init__(self, settings: NoodleSettings) -> None:
        self.settings = settings

    def capabilities(self, intent: NoodlePipelineIntent) -> list[NoodleAiCapability]:
        capabilities = [
            NoodleAiCapability(
                name="intent-to-pipeline",
                function="Convert business intent into orchestration-ready pipeline plans.",
                activation_rule="Always enabled for orchestrator planning.",
            ),
            NoodleAiCapability(
                name="schema-intelligence",
                function="Infer schema, detect drift, and propose field mappings.",
                activation_rule="Enabled for all new or changing source systems.",
            ),
            NoodleAiCapability(
                name="nl-to-sql",
                function="Generate governed analytical queries against gold and serving zones.",
                activation_rule="Enabled for curated semantic datasets.",
            ),
        ]
        if intent.requires_ml_features:
            capabilities.append(
                NoodleAiCapability(
                    name="anomaly-and-feature-intelligence",
                    function="Detect anomalies and materialize reusable feature sets.",
                    activation_rule="Enabled when ML features or predictive use cases are requested.",
                )
            )
        return capabilities

    def stack(self) -> list[str]:
        return [
            self.settings.llm_provider,
            "embedding-service",
            "prompt-guardrails",
            "sql-safety-validator",
        ]

