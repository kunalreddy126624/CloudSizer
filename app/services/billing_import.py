import csv
import json
from collections import defaultdict
from pathlib import Path

from app.models import (
    BillingImportRequest,
    BillingImportResponse,
    CloudProvider,
    EstimateActualCreate,
    WorkloadType,
)
from app.services.actuals import create_actual_observation
from app.services.catalog import get_catalog_services


AWS_PRODUCT_CODE_MAP = {
    "amazons3": "aws.s3.standard",
    "awslambda": "aws.lambda",
    "amazoncloudfront": "aws.cloudfront",
    "amazonrds": "aws.rds.postgres",
    "amazonec2": "aws.ec2.general",
    "amazonecs": "aws.ecs.fargate",
}


def import_billing_snapshot(
    request: BillingImportRequest,
    user_id: int,
) -> BillingImportResponse:
    snapshot_path = Path(request.snapshot_path)
    rows = _load_rows(snapshot_path)
    grouped_rows, warnings = _group_rows(rows, request)

    provider_counts: dict[str, int] = defaultdict(int)
    imported_records = 0
    for group in grouped_rows.values():
        create_actual_observation(
            EstimateActualCreate(
                estimate_id=request.estimate_id,
                provider=group["provider"],
                workload_type=group["workload_type"],
                service_code=group["service_code"],
                service_name=group["service_name"],
                region=group["region"],
                billing_period_start=group["billing_period_start"],
                billing_period_end=group["billing_period_end"],
                estimated_monthly_cost_usd=group["estimated_monthly_cost_usd"],
                actual_monthly_cost_usd=group["actual_monthly_cost_usd"],
                notes=group["notes"],
                observed_usage={},
            ),
            user_id,
        )
        imported_records += 1
        provider_counts[group["provider"].value] += 1

    return BillingImportResponse(
        snapshot_path=str(snapshot_path),
        imported_records=imported_records,
        provider_counts=dict(provider_counts),
        warnings=warnings,
    )


def _load_rows(snapshot_path: Path) -> list[dict[str, object]]:
    if not snapshot_path.exists():
        raise FileNotFoundError(snapshot_path)

    if snapshot_path.suffix.lower() == ".json":
        payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            if isinstance(payload.get("items"), list):
                payload = payload["items"]
            elif isinstance(payload.get("rows"), list):
                payload = payload["rows"]
            else:
                payload = [payload]
        if not isinstance(payload, list):
            raise ValueError("JSON billing export must be an array or contain items/rows.")
        return [row for row in payload if isinstance(row, dict)]

    if snapshot_path.suffix.lower() == ".csv":
        with snapshot_path.open("r", encoding="utf-8-sig", newline="") as handle:
            return [dict(row) for row in csv.DictReader(handle)]

    raise ValueError("Only CSV and JSON billing snapshots are supported.")


def _group_rows(
    rows: list[dict[str, object]],
    request: BillingImportRequest,
) -> tuple[dict[tuple[object, ...], dict[str, object]], list[str]]:
    grouped: dict[tuple[object, ...], dict[str, object]] = {}
    warnings: list[str] = []

    for index, row in enumerate(rows, start=1):
        provider = request.provider or _infer_provider(row)
        if provider is None:
            warnings.append(f"Row {index}: could not infer provider; skipped.")
            continue

        actual_cost = _extract_float(
            row,
            [
                "actual_monthly_cost_usd",
                "actual_cost_usd",
                "costinbillingcurrency",
                "cost",
                "pretaxcost",
                "lineitem/unblendedcost",
                "lineitem/netunblendedcost",
                "lineitem/blendedcost",
            ],
        )
        if actual_cost is None:
            warnings.append(f"Row {index}: could not find an actual cost column; skipped.")
            continue

        estimated_cost = _extract_float(
            row,
            [
                "estimated_monthly_cost_usd",
                "estimated_cost_usd",
                "estimated_cost",
            ],
        )
        service_name = _extract_text(
            row,
            [
                "service_name",
                "servicename",
                "product/productname",
                "service description",
                "service",
                "metercategory",
                "consumedservice",
            ],
        )
        service_code = _extract_text(row, ["service_code", "productcode", "lineitem/productcode"])
        mapped_service_code = _map_service_code(provider, service_code, service_name)
        if mapped_service_code and not service_name:
            service_name = next(
                (
                    service.name
                    for service in get_catalog_services(provider=provider)
                    if service.service_code == mapped_service_code
                ),
                mapped_service_code,
            )

        billing_period_start = _extract_text(
            row,
            [
                "billing_period_start",
                "billingperiodstart",
                "bill/billingperiodstartdate",
                "usage_start_date",
                "usagestartdate",
                "date",
            ],
        ) or ""
        billing_period_end = _extract_text(
            row,
            [
                "billing_period_end",
                "billingperiodend",
                "bill/billingperiodenddate",
                "usage_end_date",
                "usageenddate",
                "date",
            ],
        ) or billing_period_start
        if not billing_period_start:
            warnings.append(f"Row {index}: could not find billing period dates; skipped.")
            continue

        region = _extract_text(
            row,
            [
                "region",
                "product/region",
                "product/location",
                "resourcelocation",
                "location",
            ],
        )
        workload_type = request.workload_type or _infer_workload_type(service_name)
        notes = _extract_text(row, ["notes", "description", "sku description"]) or f"Imported from {request.snapshot_path}"

        key = (
            provider.value,
            workload_type.value if workload_type else None,
            mapped_service_code,
            service_name,
            region,
            billing_period_start,
            billing_period_end,
        )
        current = grouped.get(key)
        if current is None:
            grouped[key] = {
                "provider": provider,
                "workload_type": workload_type,
                "service_code": mapped_service_code,
                "service_name": service_name,
                "region": region,
                "billing_period_start": billing_period_start,
                "billing_period_end": billing_period_end,
                "estimated_monthly_cost_usd": estimated_cost,
                "actual_monthly_cost_usd": round(actual_cost, 2),
                "notes": notes,
            }
        else:
            current["actual_monthly_cost_usd"] = round(current["actual_monthly_cost_usd"] + actual_cost, 2)
            if current["estimated_monthly_cost_usd"] is None and estimated_cost is not None:
                current["estimated_monthly_cost_usd"] = estimated_cost

    return grouped, warnings


def _infer_provider(row: dict[str, object]) -> CloudProvider | None:
    provider_text = " ".join(str(value).lower() for value in row.values() if value is not None)
    if any(token in provider_text for token in ("aws", "amazon", "lineitem/productcode", "amazons3", "awslambda")):
        return CloudProvider.AWS
    if any(token in provider_text for token in ("azure", "microsoft", "consumedservice", "metercategory")):
        return CloudProvider.AZURE
    if any(token in provider_text for token in ("gcp", "google", "bigquery", "cloud run")):
        return CloudProvider.GCP
    return None


def _infer_workload_type(service_name: str | None) -> WorkloadType | None:
    if not service_name:
        return None
    lowered = service_name.lower()
    if any(token in lowered for token in ("sql", "postgres", "mysql", "cloud run", "function", "lambda")):
        return WorkloadType.APPLICATION
    if any(token in lowered for token in ("bigquery", "warehouse", "analytics")):
        return WorkloadType.ANALYTICS
    return None


def _map_service_code(
    provider: CloudProvider,
    raw_service_code: str | None,
    service_name: str | None,
) -> str | None:
    catalog = get_catalog_services(provider=provider)
    normalized_code = (raw_service_code or "").strip().lower()
    normalized_name = (service_name or "").strip().lower()

    if provider == CloudProvider.AWS and normalized_code in AWS_PRODUCT_CODE_MAP:
        return AWS_PRODUCT_CODE_MAP[normalized_code]

    for service in catalog:
        if normalized_code and service.service_code.lower() == normalized_code:
            return service.service_code
        if normalized_name and service.name.lower() == normalized_name:
            return service.service_code
        if normalized_name and normalized_name in service.name.lower():
            return service.service_code

    return None


def _extract_text(row: dict[str, object], keys: list[str]) -> str | None:
    normalized = {_normalize_key(key): value for key, value in row.items()}
    for key in keys:
        value = normalized.get(_normalize_key(key))
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _extract_float(row: dict[str, object], keys: list[str]) -> float | None:
    text = _extract_text(row, keys)
    if text is None:
        return None
    cleaned = text.replace("$", "").replace(",", "").strip()
    if cleaned in {"", "nan", "none"}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _normalize_key(value: str) -> str:
    return value.strip().lower().replace(" ", "").replace("_", "").replace("-", "")
