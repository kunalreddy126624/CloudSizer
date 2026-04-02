from statistics import mean, median

from app.db import get_connection
from app.models import (
    CloudProvider,
    EstimateAccuracy,
    PricingSource,
    ServiceAccuracy,
    ServiceEstimate,
    WorkloadType,
)


def build_accuracy_summary(
    provider: CloudProvider,
    workload_type: WorkloadType,
    services: list[ServiceEstimate],
) -> EstimateAccuracy:
    provider_observations = _load_provider_observations(provider, workload_type)
    errors = _collect_percentage_errors(provider_observations)
    compared_actuals_count = len(errors)
    live_service_count = sum(
        1 for service in services if service.pricing_source == PricingSource.LIVE_API
    )
    live_pricing_coverage = round((live_service_count / len(services)) * 100, 2) if services else 0.0
    pricing_sources = sorted({service.pricing_source for service in services}, key=lambda item: item.value)

    mean_error = round(mean(errors), 2) if errors else None
    median_error = round(median(errors), 2) if errors else None

    confidence_score = _score_confidence(
        compared_actuals_count=compared_actuals_count,
        mean_absolute_percentage_error=mean_error,
        live_pricing_coverage_percent=live_pricing_coverage,
        generated_service_count=sum(1 for service in services if service.pricing_source == PricingSource.GENERATED),
    )

    caveats: list[str] = []
    if compared_actuals_count == 0:
        caveats.append("No actual billing records have been linked for this provider and workload yet.")
    if live_pricing_coverage < 100:
        caveats.append("Live pricing is only partially available; snapshot or generated catalog prices are still in use.")
    if any(source == PricingSource.GENERATED for source in pricing_sources):
        caveats.append("Some services still rely on generated comparison pricing rather than provider-published rates.")

    return EstimateAccuracy(
        confidence_score=confidence_score,
        confidence_label=_confidence_label(confidence_score),
        compared_actuals_count=compared_actuals_count,
        mean_absolute_percentage_error=mean_error,
        median_absolute_percentage_error=median_error,
        live_pricing_coverage_percent=live_pricing_coverage,
        pricing_sources=pricing_sources,
        caveats=caveats,
    )


def build_service_accuracy(
    provider: CloudProvider,
    workload_type: WorkloadType,
    service: ServiceEstimate,
) -> ServiceAccuracy:
    observations = _load_service_observations(provider, workload_type, service.service_code)
    errors = _collect_percentage_errors(observations)
    mean_error = round(mean(errors), 2) if errors else None
    confidence_score = _score_service_confidence(
        compared_actuals_count=len(errors),
        mean_absolute_percentage_error=mean_error,
        pricing_source=service.pricing_source,
    )
    caveats: list[str] = []
    if not observations:
        caveats.append("No service-specific actual billing records have been imported yet.")
    if service.pricing_source != PricingSource.LIVE_API:
        caveats.append("This service is not currently backed by a live provider pricing feed.")
    if service.pricing_source == PricingSource.GENERATED:
        caveats.append("This service still uses generated comparison pricing.")

    return ServiceAccuracy(
        confidence_score=confidence_score,
        confidence_label=_confidence_label(confidence_score),
        compared_actuals_count=len(errors),
        mean_absolute_percentage_error=mean_error,
        pricing_source=service.pricing_source,
        live_pricing_available=service.pricing_source == PricingSource.LIVE_API,
        caveats=caveats,
    )


def _load_provider_observations(
    provider: CloudProvider,
    workload_type: WorkloadType,
) -> list[tuple[float, float]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT estimated_monthly_cost_usd, actual_monthly_cost_usd
            FROM estimate_actuals
            WHERE provider = ?
              AND workload_type = ?
              AND estimated_monthly_cost_usd IS NOT NULL
            """,
            (provider.value, workload_type.value),
        ).fetchall()

    return [
        (float(row["estimated_monthly_cost_usd"]), float(row["actual_monthly_cost_usd"]))
        for row in rows
        if row["actual_monthly_cost_usd"]
    ]


def _load_service_observations(
    provider: CloudProvider,
    workload_type: WorkloadType,
    service_code: str | None,
) -> list[tuple[float, float]]:
    if not service_code:
        return _load_provider_observations(provider, workload_type)

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT estimated_monthly_cost_usd, actual_monthly_cost_usd
            FROM estimate_actuals
            WHERE provider = ?
              AND workload_type = ?
              AND service_code = ?
              AND estimated_monthly_cost_usd IS NOT NULL
            """,
            (provider.value, workload_type.value, service_code),
        ).fetchall()

    observations = [
        (float(row["estimated_monthly_cost_usd"]), float(row["actual_monthly_cost_usd"]))
        for row in rows
        if row["actual_monthly_cost_usd"]
    ]
    return observations or _load_provider_observations(provider, workload_type)


def _collect_percentage_errors(observations: list[tuple[float, float]]) -> list[float]:
    errors: list[float] = []
    for estimated, actual in observations:
        if actual <= 0:
            continue
        errors.append(abs(estimated - actual) / actual * 100)
    return errors


def _score_confidence(
    compared_actuals_count: int,
    mean_absolute_percentage_error: float | None,
    live_pricing_coverage_percent: float,
    generated_service_count: int,
) -> float:
    sample_component = min(compared_actuals_count * 8, 32)
    error_component = 10.0 if mean_absolute_percentage_error is None else max(0.0, 38.0 - min(mean_absolute_percentage_error, 38.0))
    live_component = live_pricing_coverage_percent * 0.2
    generation_penalty = min(generated_service_count * 6, 18)
    score = 20.0 + sample_component + error_component + live_component - generation_penalty
    return round(max(0.0, min(score, 100.0)), 2)


def _score_service_confidence(
    compared_actuals_count: int,
    mean_absolute_percentage_error: float | None,
    pricing_source: PricingSource,
) -> float:
    sample_component = min(compared_actuals_count * 12, 36)
    error_component = 10.0 if mean_absolute_percentage_error is None else max(0.0, 42.0 - min(mean_absolute_percentage_error, 42.0))
    source_component = {
        PricingSource.LIVE_API: 28.0,
        PricingSource.CATALOG_SNAPSHOT: 18.0,
        PricingSource.GENERATED: 8.0,
    }[pricing_source]
    score = 8.0 + sample_component + error_component + source_component
    return round(max(0.0, min(score, 100.0)), 2)


def _confidence_label(score: float) -> str:
    if score >= 80:
        return "high"
    if score >= 55:
        return "medium"
    return "low"
