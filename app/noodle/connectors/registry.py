from __future__ import annotations

from app.noodle.schemas import NoodleConnectorPlan, NoodlePipelineIntent


CONNECTOR_BY_SOURCE_KIND = {
    "api": ("fastapi-pull-connector", "micro_batch"),
    "database": ("cdc-connector", "hybrid"),
    "stream": ("stream-subscriber", "stream"),
    "file": ("batch-file-loader", "batch"),
    "iot": ("edge-telemetry-gateway", "stream"),
    "saas": ("saas-sync-connector", "batch"),
}


def build_connector_plans(intent: NoodlePipelineIntent) -> list[NoodleConnectorPlan]:
    plans: list[NoodleConnectorPlan] = []
    for source in intent.sources:
        connector_name, mode = CONNECTOR_BY_SOURCE_KIND[source.kind]
        plans.append(
            NoodleConnectorPlan(
                source_name=source.name,
                connector_type=connector_name,
                ingestion_mode=mode,  # type: ignore[arg-type]
                landing_topic=f"noodle.{intent.name}.{source.name}",
                landing_zone="bronze",
                notes=[
                    f"Source environment: {source.environment}.",
                    f"Change pattern: {source.change_pattern}.",
                ],
            )
        )
    return plans

