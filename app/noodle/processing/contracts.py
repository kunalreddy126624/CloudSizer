from __future__ import annotations

from app.noodle.schemas import NoodlePipelineIntent, NoodleProcessingStage


def build_processing_stages(intent: NoodlePipelineIntent) -> list[NoodleProcessingStage]:
    stages = [
        NoodleProcessingStage(
            name="raw_standardization",
            engine="spark",
            mode="batch" if intent.latency_slo in {"hours", "daily"} else "micro_batch",
            purpose="Normalize schemas, conform column types, and land trusted silver tables.",
            outputs=["silver"],
        ),
        NoodleProcessingStage(
            name="quality_and_enrichment",
            engine="python-ai-workers",
            mode="micro_batch",
            purpose="Apply quality rules, semantic tagging, and AI-assisted enrichment.",
            outputs=["silver", "gold"],
        ),
    ]
    if intent.requires_realtime_serving:
        stages.append(
            NoodleProcessingStage(
                name="stream_serving_projection",
                engine="flink",
                mode="stream",
                purpose="Produce low-latency serving projections and operational views.",
                outputs=["gold", "serving"],
            )
        )
    if intent.requires_ml_features:
        stages.append(
            NoodleProcessingStage(
                name="feature_materialization",
                engine="spark",
                mode="batch",
                purpose="Generate reusable ML features and training snapshots.",
                outputs=["feature_store"],
            )
        )
    return stages

