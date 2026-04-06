import json
import os
from datetime import UTC, datetime
from functools import lru_cache
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from app.models import (
    CatalogService,
    CloudProvider,
    LivePricingRefreshRequest,
    LivePricingRefreshResponse,
    LivePricingRefreshResult,
    PricingDimension,
    PricingSource,
)
from app.services.catalog import CATALOG_PATH, get_catalog_services, upsert_catalog_price_override


AWS_REGION_LABELS = {
    "ap-south-1": "Asia Pacific (Mumbai)",
    "us-east-1": "US East (N. Virginia)",
    "eu-west-1": "EU (Ireland)",
    "global": "Global",
}

GCP_SERVICE_DISPLAY_NAMES = {
    "gcp.cloudrun": "Cloud Run",
    "gcp.storage.standard": "Cloud Storage",
    "gcp.bigquery": "BigQuery",
    "gcp.cloudsql.postgres": "Cloud SQL",
}


def refresh_live_pricing(request: LivePricingRefreshRequest) -> LivePricingRefreshResponse:
    results: list[LivePricingRefreshResult] = []
    for provider in request.providers:
        if provider == CloudProvider.AZURE:
            direct_result = _refresh_azure_prices()
        elif provider == CloudProvider.AWS:
            direct_result = _refresh_aws_prices()
        elif provider == CloudProvider.GCP:
            direct_result = _refresh_gcp_prices()
        else:
            direct_result = LivePricingRefreshResult(
                provider=provider,
                warnings=["Direct live pricing adapter is not configured for this provider yet; benchmark live pricing was used where possible."],
                skipped_services=0,
            )

        benchmark_result = _refresh_benchmark_prices(provider)
        results.append(_combine_results(provider, direct_result, benchmark_result))

    return LivePricingRefreshResponse(
        refreshed_at=datetime.now(UTC).isoformat(),
        results=results,
    )


def _refresh_azure_prices() -> LivePricingRefreshResult:
    services = {
        service.service_code: service
        for service in get_catalog_services(provider=CloudProvider.AZURE)
        if service.service_code in {"azure.blob.hot", "azure.functions", "azure.containerapps", "azure.sql.db"}
    }
    return _refresh_services(CloudProvider.AZURE, services, _refresh_single_azure_service)


def _refresh_aws_prices() -> LivePricingRefreshResult:
    services = {
        service.service_code: service
        for service in get_catalog_services(provider=CloudProvider.AWS)
        if service.service_code in {"aws.ecs.fargate", "aws.lambda", "aws.s3.standard", "aws.rds.postgres", "aws.cloudfront"}
    }
    return _refresh_services(CloudProvider.AWS, services, _refresh_single_aws_service)


def _refresh_gcp_prices() -> LivePricingRefreshResult:
    services = {
        service.service_code: service
        for service in get_catalog_services(provider=CloudProvider.GCP)
        if service.service_code in {"gcp.cloudrun", "gcp.storage.standard", "gcp.bigquery", "gcp.cloudsql.postgres"}
    }
    api_key = os.getenv("GOOGLE_CLOUD_PRICING_API_KEY")
    if not api_key:
        return LivePricingRefreshResult(
            provider=CloudProvider.GCP,
            skipped_services=len(services),
            warnings=["Set GOOGLE_CLOUD_PRICING_API_KEY to enable GCP live pricing refresh."],
        )
    return _refresh_services(
        CloudProvider.GCP,
        services,
        lambda service: _refresh_single_gcp_service(service, api_key),
    )


def _refresh_services(provider, services, refresh_fn) -> LivePricingRefreshResult:
    updated_services = 0
    skipped_services = 0
    warnings: list[str] = []

    for service_code, service in services.items():
        try:
            updated = refresh_fn(service)
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            warnings.append(f"{service_code}: {exc}")
            skipped_services += 1
            continue

        if updated:
            updated_services += 1
        else:
            skipped_services += 1

    if not services:
        warnings.append(f"No {provider.value.upper()} catalog services matched the live pricing adapter.")

    return LivePricingRefreshResult(
        provider=provider,
        updated_services=updated_services,
        skipped_services=skipped_services,
        warnings=warnings,
    )


def _refresh_single_azure_service(service: CatalogService) -> bool:
    updated_dimensions = [dimension.model_copy() for dimension in service.dimensions]

    if service.service_code == "azure.blob.hot":
        rate = _fetch_azure_blob_hot_rate(service.default_region)
        _update_dimension_rate(updated_dimensions, "storage_gb", rate)
    elif service.service_code == "azure.containerapps":
        cpu_rate, memory_rate = _fetch_azure_container_apps_rates(service.default_region)
        _update_dimension_rate(updated_dimensions, "vcpu_seconds_million", cpu_rate * 1_000_000)
        _update_dimension_rate(updated_dimensions, "memory_gb_seconds_million", memory_rate * 1_000_000)
    elif service.service_code == "azure.functions":
        request_rate, execution_rate = _fetch_azure_functions_rates(service.default_region)
        _update_dimension_rate(updated_dimensions, "requests_million", request_rate * 1_000_000)
        _update_dimension_rate(updated_dimensions, "gb_seconds_million", execution_rate * 1_000_000)
    elif service.service_code == "azure.sql.db":
        compute_rate, storage_rate = _fetch_azure_sql_db_rates(service.default_region)
        _update_dimension_rate(updated_dimensions, "compute_hours", compute_rate)
        _update_dimension_rate(updated_dimensions, "storage_gb", storage_rate)
    else:
        return False

    _persist_live_price_override(service, updated_dimensions)
    return True


def _refresh_single_aws_service(service: CatalogService) -> bool:
    updated_dimensions = [dimension.model_copy() for dimension in service.dimensions]
    region_label = AWS_REGION_LABELS.get(service.default_region, AWS_REGION_LABELS["global"])

    if service.service_code == "aws.ecs.fargate":
        payload = _fetch_json("https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/index.json")
        vcpu_rate = _find_aws_price(
            payload,
            lambda attrs: attrs.get("location") == region_label and attrs.get("usagetype", "").endswith("Fargate-vCPU-Hours:perCPU"),
            lambda dim: dim.get("unit") == "hours",
        )
        memory_rate = _find_aws_price(
            payload,
            lambda attrs: attrs.get("location") == region_label and attrs.get("usagetype", "").endswith("Fargate-GB-Hours"),
            lambda dim: dim.get("unit") == "hours",
        )
        if vcpu_rate is None or memory_rate is None:
            raise ValueError("AWS Fargate live rates not found.")
        _update_dimension_rate(updated_dimensions, "vcpu_hours", vcpu_rate)
        _update_dimension_rate(updated_dimensions, "memory_gb_hours", memory_rate)
    elif service.service_code == "aws.lambda":
        payload = _fetch_json("https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSLambda/current/index.json")
        request_rate = _find_aws_price(
            payload,
            lambda attrs: attrs.get("location") == region_label and "Request" in attrs.get("group", ""),
            lambda dim: dim.get("unit") == "Requests",
        )
        duration_rate = _find_aws_price(
            payload,
            lambda attrs: attrs.get("location") == region_label and "Duration" in attrs.get("group", ""),
            lambda dim: dim.get("unit") in {"GB-Second", "Lambda-GB-Second"},
        )
        if request_rate is None or duration_rate is None:
            raise ValueError("AWS Lambda live rates not found.")
        _update_dimension_rate(updated_dimensions, "requests_million", request_rate * 1_000_000)
        _update_dimension_rate(updated_dimensions, "gb_seconds_million", duration_rate * 1_000_000)
    elif service.service_code == "aws.s3.standard":
        payload = _fetch_json("https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/index.json")
        storage_rate = _find_aws_price(
            payload,
            lambda attrs: attrs.get("location") == region_label
            and "TimedStorage-ByteHrs" in attrs.get("usagetype", "")
            and attrs.get("storageClass", "").lower() in {"standard", "general purpose"},
            lambda dim: dim.get("unit") == "GB-Mo",
        )
        if storage_rate is None:
            raise ValueError("Amazon S3 Standard live rate not found.")
        _update_dimension_rate(updated_dimensions, "storage_gb", storage_rate)
    elif service.service_code == "aws.rds.postgres":
        payload = _fetch_json("https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/index.json")
        instance_rate = _find_aws_price(
            payload,
            lambda attrs: attrs.get("location") == region_label
            and attrs.get("databaseEngine", "").lower() == "postgresql"
            and attrs.get("instanceType") == "db.t3.medium",
            lambda dim: dim.get("unit") == "Hrs",
        )
        storage_rate = _find_aws_price(
            payload,
            lambda attrs: attrs.get("location") == region_label
            and attrs.get("databaseEngine", "").lower() == "postgresql"
            and "StorageUsage" in attrs.get("usagetype", ""),
            lambda dim: dim.get("unit") == "GB-Mo",
        )
        if instance_rate is None or storage_rate is None:
            raise ValueError("Amazon RDS PostgreSQL live rates not found.")
        _update_dimension_rate(updated_dimensions, "db_instance_hours", instance_rate)
        _update_dimension_rate(updated_dimensions, "storage_gb", storage_rate)
    elif service.service_code == "aws.cloudfront":
        payload = _fetch_json("https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudFront/current/index.json")
        transfer_rate = _find_aws_price(
            payload,
            lambda attrs: attrs.get("fromLocation", "").lower() == "india" and attrs.get("productFamily") == "Data Transfer",
            lambda dim: dim.get("unit") == "GB",
        )
        request_rate = _find_aws_price(
            payload,
            lambda attrs: attrs.get("productFamily") == "Request" and "https" in str(attrs.get("requestDescription", "")).lower(),
            lambda dim: dim.get("unit") in {"10,000 Requests", "Requests"},
        )
        if transfer_rate is None:
            raise ValueError("Amazon CloudFront data transfer rate not found.")
        _update_dimension_rate(updated_dimensions, "data_transfer_gb", transfer_rate)
        if request_rate is not None:
            normalized_request_rate = request_rate if request_rate < 1 else request_rate / 10_000
            _update_dimension_rate(updated_dimensions, "requests_10k", normalized_request_rate * 10_000)
    else:
        return False

    _persist_live_price_override(service, updated_dimensions)
    return True


def _refresh_single_gcp_service(service: CatalogService, api_key: str) -> bool:
    updated_dimensions = [dimension.model_copy() for dimension in service.dimensions]
    skus = _fetch_gcp_skus(service.service_code, api_key)

    if service.service_code == "gcp.cloudrun":
        cpu_rate = _find_gcp_rate(
            skus,
            lambda sku: "cpu" in sku.get("description", "").lower() and service.default_region in sku.get("serviceRegions", []),
        )
        memory_rate = _find_gcp_rate(
            skus,
            lambda sku: "memory" in sku.get("description", "").lower() and service.default_region in sku.get("serviceRegions", []),
        )
        if cpu_rate is None or memory_rate is None:
            raise ValueError("Cloud Run live rates not found.")
        _update_dimension_rate(updated_dimensions, "vcpu_seconds_million", cpu_rate * 1_000_000)
        _update_dimension_rate(updated_dimensions, "memory_gb_seconds_million", memory_rate * 1_000_000)
    elif service.service_code == "gcp.storage.standard":
        storage_rate = _find_gcp_rate(
            skus,
            lambda sku: "standard storage" in sku.get("description", "").lower() and service.default_region in sku.get("serviceRegions", []),
        )
        if storage_rate is None:
            raise ValueError("Cloud Storage Standard live rate not found.")
        _update_dimension_rate(updated_dimensions, "storage_gb", storage_rate)
    elif service.service_code == "gcp.bigquery":
        query_rate = _find_gcp_rate(
            skus,
            lambda sku: "analysis" in sku.get("description", "").lower() or "query" in sku.get("description", "").lower(),
        )
        if query_rate is None:
            raise ValueError("BigQuery live rate not found.")
        _update_dimension_rate(updated_dimensions, "query_tb", query_rate)
    elif service.service_code == "gcp.cloudsql.postgres":
        instance_rate = _find_gcp_rate(
            skus,
            lambda sku: "postgresql" in sku.get("description", "").lower() and "instance" in sku.get("description", "").lower(),
        )
        storage_rate = _find_gcp_rate(
            skus,
            lambda sku: "postgresql" in sku.get("description", "").lower() and "storage" in sku.get("description", "").lower(),
        )
        if instance_rate is None or storage_rate is None:
            raise ValueError("Cloud SQL PostgreSQL live rates not found.")
        _update_dimension_rate(updated_dimensions, "db_instance_hours", instance_rate)
        _update_dimension_rate(updated_dimensions, "storage_gb", storage_rate)
    else:
        return False

    _persist_live_price_override(service, updated_dimensions)
    return True


def _persist_live_price_override(service: CatalogService, dimensions: list[PricingDimension]) -> None:
    upsert_catalog_price_override(
        provider=service.provider,
        service_code=service.service_code,
        base_monthly_cost_usd=service.base_monthly_cost_usd,
        dimensions=dimensions,
        pricing_source=PricingSource.LIVE_API,
    )


def _update_dimension_rate(dimensions: list[PricingDimension], key: str, rate_per_unit_usd: float) -> None:
    for index, dimension in enumerate(dimensions):
        if dimension.key == key:
            dimensions[index] = dimension.model_copy(
                update={"rate_per_unit_usd": round(rate_per_unit_usd, 6)}
            )
            return


def _fetch_azure_blob_hot_rate(region: str) -> float:
    filter_expr = (
        "serviceName eq 'Storage' and "
        f"armRegionName eq '{region}' and "
        "contains(meterName,'Hot') and contains(meterName,'Data Stored')"
    )
    encoded_filter = quote(filter_expr, safe="()',$=")
    items = _fetch_azure_retail_items(
        f"https://prices.azure.com/api/retail/prices?$filter={encoded_filter}"
    )
    price = next(
        (
            item.get("retailPrice")
            for item in items
            if item.get("retailPrice") is not None
            and "blob" in str(item.get("productName", "")).lower()
            and "reserved" not in str(item.get("productName", "")).lower()
            and "data lake" not in str(item.get("productName", "")).lower()
            and "cool" not in str(item.get("meterName", "")).lower()
        ),
        None,
    )
    if price is None:
        raise ValueError("Azure Blob Storage retail price not found.")
    return float(price)


def _fetch_azure_functions_rates(region: str) -> tuple[float, float]:
    filter_expr = (
        "serviceName eq 'Functions' and "
        f"armRegionName eq '{region}' and "
        "priceType eq 'Consumption'"
    )
    encoded_filter = quote(filter_expr, safe="()',$=")
    items = _fetch_azure_retail_items(
        f"https://prices.azure.com/api/retail/prices?$filter={encoded_filter}"
    )
    request_price = None
    execution_price = None
    for item in items:
        meter_name = str(item.get("meterName", "")).lower()
        if request_price is None and "execution" in meter_name and "per million" in meter_name:
            request_price = float(item["retailPrice"]) / 1_000_000
        if execution_price is None and "gb-s" in meter_name:
            execution_price = float(item["retailPrice"])

    if request_price is None or execution_price is None:
        raise ValueError("Azure Functions retail price not found.")

    return request_price, execution_price


def _fetch_azure_container_apps_rates(region: str) -> tuple[float, float]:
    filter_expr = f"serviceName eq 'Azure Container Apps' and armRegionName eq '{region}'"
    encoded_filter = quote(filter_expr, safe="()',$=")
    items = _fetch_azure_retail_items(
        f"https://prices.azure.com/api/retail/prices?$filter={encoded_filter}"
    )
    cpu_rate = None
    memory_rate = None
    for item in items:
        meter_name = str(item.get("meterName", "")).lower()
        sku_name = str(item.get("skuName", "")).lower()
        if "standard" not in sku_name:
            continue
        if cpu_rate is None and "vcpu active usage" in meter_name:
            cpu_rate = float(item["retailPrice"])
        if memory_rate is None and "memory active usage" in meter_name:
            memory_rate = float(item["retailPrice"])

    if cpu_rate is None or memory_rate is None:
        raise ValueError("Azure Container Apps retail price not found.")

    return cpu_rate, memory_rate


def _fetch_azure_sql_db_rates(region: str) -> tuple[float, float]:
    filter_expr = f"serviceName eq 'SQL Database' and armRegionName eq '{region}'"
    encoded_filter = quote(filter_expr, safe="()',$=")
    items = _fetch_azure_retail_items(
        f"https://prices.azure.com/api/retail/prices?$filter={encoded_filter}"
    )
    compute_rate = None
    storage_rate = None
    for item in items:
        meter_name = str(item.get("meterName", "")).lower()
        product_name = str(item.get("productName", "")).lower()
        sku_name = str(item.get("skuName", "")).lower()
        if compute_rate is None and "general purpose" in meter_name and "gen5 1 vcore" in meter_name and "zone redundancy" not in meter_name:
            compute_rate = float(item["retailPrice"])
        if storage_rate is None and "data stored" in meter_name and "backup" not in product_name and "lrs" in sku_name:
            storage_rate = float(item["retailPrice"])

    if compute_rate is None or storage_rate is None:
        raise ValueError("Azure SQL Database retail price not found.")

    return compute_rate, storage_rate


def _fetch_gcp_skus(service_code: str, api_key: str) -> list[dict[str, object]]:
    display_name = GCP_SERVICE_DISPLAY_NAMES.get(service_code)
    if not display_name:
        raise ValueError(f"GCP service mapping not configured for {service_code}.")

    services_payload = _fetch_json(
        f"https://cloudbilling.googleapis.com/v1/services?key={quote(api_key)}"
    )
    service_id = next(
        (
            service["name"]
            for service in services_payload.get("services", [])
            if service.get("displayName") == display_name
        ),
        None,
    )
    if service_id is None:
        raise ValueError(f"GCP billing service id not found for {display_name}.")

    skus_payload = _fetch_json(
        f"https://cloudbilling.googleapis.com/v1/{service_id}/skus?key={quote(api_key)}&pageSize=5000"
    )
    return [sku for sku in skus_payload.get("skus", []) if isinstance(sku, dict)]


def _find_aws_price(payload: dict[str, object], product_filter, dimension_filter) -> float | None:
    products = payload.get("products", {})
    terms = payload.get("terms", {}).get("OnDemand", {})
    matched_prices: list[float] = []

    for sku, product in products.items():
        attributes = product.get("attributes", {})
        attributes["productFamily"] = product.get("productFamily")
        if not product_filter(attributes):
            continue

        for offer_term in terms.get(sku, {}).values():
            for dimension in offer_term.get("priceDimensions", {}).values():
                if dimension_filter(dimension):
                    usd_value = dimension.get("pricePerUnit", {}).get("USD")
                    if usd_value not in {None, ""}:
                        matched_prices.append(float(usd_value))

    return min(matched_prices) if matched_prices else None


def _find_gcp_rate(skus: list[dict[str, object]], predicate) -> float | None:
    matched_rates: list[float] = []
    for sku in skus:
        if not predicate(sku):
            continue
        for pricing_info in sku.get("pricingInfo", []):
            expression = pricing_info.get("pricingExpression", {})
            tiered_rates = expression.get("tieredRates", [])
            if not tiered_rates:
                continue
            unit_price = tiered_rates[0].get("unitPrice", {})
            units = float(unit_price.get("units", 0))
            nanos = float(unit_price.get("nanos", 0)) / 1_000_000_000
            conversion_factor = float(expression.get("baseUnitConversionFactor", 1) or 1)
            matched_rates.append((units + nanos) / conversion_factor)
    return min(matched_rates) if matched_rates else None


def _combine_results(
    provider: CloudProvider,
    direct_result: LivePricingRefreshResult,
    benchmark_result: LivePricingRefreshResult,
) -> LivePricingRefreshResult:
    return LivePricingRefreshResult(
        provider=provider,
        updated_services=direct_result.updated_services + benchmark_result.updated_services,
        skipped_services=direct_result.skipped_services + benchmark_result.skipped_services,
        warnings=[*direct_result.warnings, *benchmark_result.warnings],
    )


def _refresh_benchmark_prices(provider: CloudProvider) -> LivePricingRefreshResult:
    benchmark_ratios = _load_benchmark_family_ratios()
    services = get_catalog_services(provider=provider)
    updated_services = 0
    skipped_services = 0
    warnings: list[str] = []

    for service in services:
        if service.pricing_source == PricingSource.LIVE_API:
            continue

        benchmark_ratio = benchmark_ratios.get(service.service_family)
        if benchmark_ratio is None:
            skipped_services += 1
            continue

        updated_dimensions = [
            dimension.model_copy(update={"rate_per_unit_usd": round(dimension.rate_per_unit_usd * benchmark_ratio, 6)})
            for dimension in service.dimensions
        ]
        upsert_catalog_price_override(
            provider=service.provider,
            service_code=service.service_code,
            base_monthly_cost_usd=round(service.base_monthly_cost_usd * benchmark_ratio, 4),
            dimensions=updated_dimensions,
            pricing_source=PricingSource.BENCHMARK_LIVE,
        )
        updated_services += 1

    if not benchmark_ratios:
        warnings.append("No live-backed service families were available to derive benchmark pricing ratios.")

    return LivePricingRefreshResult(
        provider=provider,
        updated_services=updated_services,
        skipped_services=skipped_services,
        warnings=warnings,
    )


@lru_cache(maxsize=1)
def _load_raw_catalog_by_code() -> dict[str, CatalogService]:
    raw_catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    baseline: dict[str, CatalogService] = {}
    for services in raw_catalog.values():
        for service in services:
            parsed = CatalogService.model_validate(service)
            baseline[parsed.service_code] = parsed
    return baseline


def _load_benchmark_family_ratios() -> dict[str, float]:
    raw_catalog = _load_raw_catalog_by_code()
    family_ratios: dict[str, float] = {}

    for provider in (CloudProvider.AWS, CloudProvider.AZURE, CloudProvider.GCP):
        for service in get_catalog_services(provider=provider):
            if service.pricing_source != PricingSource.LIVE_API:
                continue

            baseline = raw_catalog.get(service.service_code)
            if baseline is None:
                continue

            rates: list[float] = []
            baseline_dimensions = {dimension.key: dimension for dimension in baseline.dimensions}
            for dimension in service.dimensions:
                raw_dimension = baseline_dimensions.get(dimension.key)
                if raw_dimension and raw_dimension.rate_per_unit_usd > 0:
                    rates.append(dimension.rate_per_unit_usd / raw_dimension.rate_per_unit_usd)

            if baseline.base_monthly_cost_usd > 0:
                rates.append(service.base_monthly_cost_usd / baseline.base_monthly_cost_usd)

            if not rates:
                continue

            ratio = sum(rates) / len(rates)
            existing_ratio = family_ratios.get(service.service_family)
            family_ratios[service.service_family] = ratio if existing_ratio is None else max(existing_ratio, ratio)

    return family_ratios


def _fetch_azure_retail_items(url: str) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    next_url: str | None = url
    while next_url:
        payload = _fetch_json(next_url)
        items.extend([item for item in payload.get("Items", []) if isinstance(item, dict)])
        next_url = payload.get("NextPageLink")
    return items


def _fetch_json(url: str) -> dict[str, object]:
    request = Request(url, headers={"User-Agent": "CloudSizer/0.1"})
    with urlopen(request, timeout=25) as response:
        return json.loads(response.read().decode("utf-8"))
