from __future__ import annotations

import json
from datetime import UTC, datetime

from app.db import get_connection
from app.models import CloudProvider, LivePricingRefreshResult, PricingSource
from app.services.catalog import CATALOG_PATH, get_catalog_services, update_catalog_price_override_detail


MIN_REASONABLE_RATIO = 0.2
MAX_REASONABLE_RATIO = 5.0


def verify_live_prices(provider: CloudProvider) -> LivePricingRefreshResult:
    updated_services = 0
    skipped_services = 0
    warnings: list[str] = []

    for service in get_catalog_services(provider=provider):
        if service.pricing_source != PricingSource.LIVE_API:
            continue

        verification = _evaluate_live_price(service.service_code)
        update_catalog_price_override_detail(provider, service.service_code, verification)
        if verification["verified_live_price"]:
            updated_services += 1
        else:
            skipped_services += 1
            warnings.append(f"{service.service_code}: {verification['verification_reason']}")

    return LivePricingRefreshResult(
        provider=provider,
        updated_services=0,
        verified_services=updated_services,
        skipped_services=skipped_services,
        warnings=warnings,
    )


def _evaluate_live_price(service_code: str) -> dict[str, object]:
    with get_connection() as connection:
        override_row = connection.execute(
            """
            SELECT provider, service_code, base_monthly_cost_usd, dimensions_json, last_validated_at
            FROM catalog_price_overrides
            WHERE service_code = ?
            """,
            (service_code,),
        ).fetchone()

    if override_row is None:
        return _failed_verification("No live override exists for this service.")

    last_validated_at = override_row["last_validated_at"]
    if not last_validated_at:
        return _failed_verification("Live price has no validation timestamp.")

    try:
        validated_at = datetime.fromisoformat(str(last_validated_at).replace("Z", "+00:00"))
    except ValueError:
        return _failed_verification("Live price timestamp is invalid.")

    if validated_at.tzinfo is None:
        validated_at = validated_at.replace(tzinfo=UTC)

    age_hours = (datetime.now(UTC) - validated_at.astimezone(UTC)).total_seconds() / 3600
    if age_hours > 72:
        return _failed_verification("Live price is older than 72 hours.")

    baseline_monthly_cost = float(override_row["base_monthly_cost_usd"])
    if baseline_monthly_cost <= 0:
        return _failed_verification("Live price is not positive.")

    ratio = 1.0
    raw_catalog_service = _load_raw_catalog_service(service_code)
    if raw_catalog_service is not None:
        baseline_dimensions = raw_catalog_service.get("dimensions", [])
        live_dimensions = json.loads(override_row["dimensions_json"])
        baseline_total = float(raw_catalog_service.get("base_monthly_cost_usd", 0)) + sum(
            float(item.get("suggested_value", 0)) * float(item.get("rate_per_unit_usd", 0))
            for item in baseline_dimensions
        )
        live_total = baseline_monthly_cost + sum(
            float(item.get("suggested_value", 0)) * float(item.get("rate_per_unit_usd", 0))
            for item in live_dimensions
        )
        if baseline_total > 0:
            ratio = live_total / baseline_total

    if ratio < MIN_REASONABLE_RATIO or ratio > MAX_REASONABLE_RATIO:
        return _failed_verification(f"Live price failed platform cross-check ratio bounds ({ratio:.2f}).")

    return {
        "verified_live_price": True,
        "verification_source": "platform_cross_check",
        "verification_reason": "Live price passed freshness and ratio checks.",
        "verified_at": datetime.now(UTC).isoformat(),
    }


def _failed_verification(reason: str) -> dict[str, object]:
    return {
        "verified_live_price": False,
        "verification_source": "platform_cross_check",
        "verification_reason": reason,
        "verified_at": datetime.now(UTC).isoformat(),
    }


def _load_raw_catalog_service(service_code: str) -> dict[str, object] | None:
    raw_catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    for services in raw_catalog.values():
        for service in services:
            if service.get("service_code") == service_code:
                return service
    return None
