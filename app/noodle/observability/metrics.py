from __future__ import annotations

from app.noodle.schemas import NoodleObservabilityCapability


class NoodleObservabilityService:
    def capabilities(self) -> list[NoodleObservabilityCapability]:
        return [
            NoodleObservabilityCapability(
                name="pipeline-health",
                metric_family="latency-throughput-failures",
                sink="prometheus-grafana",
            ),
            NoodleObservabilityCapability(
                name="data-quality-scorecards",
                metric_family="freshness-completeness-distribution",
                sink="quality-control-plane",
            ),
            NoodleObservabilityCapability(
                name="cost-observability",
                metric_family="pipeline-and-domain-cost-attribution",
                sink="finops-dashboard",
            ),
        ]

    def stack(self) -> list[str]:
        return ["opentelemetry", "prometheus", "grafana", "structured-logs", "cost-attribution-pipeline"]

