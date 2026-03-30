import json
from functools import lru_cache
from pathlib import Path

from app.models import (
    CatalogService,
    CloudProvider,
    ProviderSummary,
    ServiceCategory,
    ServiceComparisonGroup,
)


CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "service_catalog.json"

PROVIDER_SUMMARIES: dict[CloudProvider, ProviderSummary] = {
    CloudProvider.AWS: ProviderSummary(
        provider=CloudProvider.AWS,
        strengths=["Broad service coverage", "Strong enterprise ecosystem"],
        default_regions=["us-east-1", "ap-south-1", "eu-west-1"],
    ),
    CloudProvider.AZURE: ProviderSummary(
        provider=CloudProvider.AZURE,
        strengths=["Microsoft workload alignment", "Good fit for ERP and CRM"],
        default_regions=["eastus", "centralindia", "westeurope"],
    ),
    CloudProvider.GCP: ProviderSummary(
        provider=CloudProvider.GCP,
        strengths=["Data and analytics focus", "Operational simplicity"],
        default_regions=["us-central1", "asia-south1", "europe-west1"],
    ),
}


SERVICE_FAMILY_LABELS: dict[str, str] = {
    "virtual_machine": "Virtual Machines",
    "containers_managed": "Managed Containers",
    "serverless_runtime": "Serverless Runtime",
    "object_storage": "Object Storage",
    "block_storage": "Block Storage",
    "relational_database": "Relational Database",
    "nosql_database": "NoSQL Database",
    "load_balancer": "Load Balancer",
    "content_delivery": "Content Delivery",
    "data_warehouse": "Data Warehouse",
    "stream_analytics": "Stream Analytics",
    "generative_ai": "Generative AI",
    "vision_ai": "Vision AI",
    "key_management": "Key Management",
    "web_application_firewall": "Web Application Firewall",
}


@lru_cache(maxsize=1)
def _load_catalog() -> dict[CloudProvider, list[CatalogService]]:
    raw_catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    loaded: dict[CloudProvider, list[CatalogService]] = {}

    for provider_value, services in raw_catalog.items():
        provider = CloudProvider(provider_value)
        loaded[provider] = [CatalogService.model_validate(service) for service in services]

    return loaded


def reload_catalog() -> None:
    _load_catalog.cache_clear()


def get_catalog_metadata() -> dict[str, int | str]:
    catalog = _load_catalog()
    total_services = sum(len(services) for services in catalog.values())
    total_families = len(
        {service.service_family for services in catalog.values() for service in services}
    )
    return {
        "catalog_path": str(CATALOG_PATH),
        "providers": len(catalog),
        "services": total_services,
        "service_families": total_families,
    }


def get_provider_summaries() -> list[ProviderSummary]:
    return list(PROVIDER_SUMMARIES.values())


def get_catalog_services(
    provider: CloudProvider | None = None,
    category: ServiceCategory | None = None,
) -> list[CatalogService]:
    catalog = _load_catalog()
    providers = [provider] if provider else list(catalog.keys())
    services: list[CatalogService] = []

    for provider_key in providers:
        for service in catalog[provider_key]:
            if category and service.category != category:
                continue
            services.append(service)

    return services


def get_catalog_service(provider: CloudProvider, service_code: str) -> CatalogService:
    for service in _load_catalog()[provider]:
        if service.service_code == service_code:
            return service

    raise KeyError(service_code)


def get_service_comparison_groups(
    category: ServiceCategory | None = None,
) -> list[ServiceComparisonGroup]:
    grouped: dict[str, list[CatalogService]] = {}

    for services in _load_catalog().values():
        for service in services:
            if category and service.category != category:
                continue
            grouped.setdefault(service.service_family, []).append(service)

    comparison_groups: list[ServiceComparisonGroup] = []
    for family, services in grouped.items():
        comparison_groups.append(
            ServiceComparisonGroup(
                service_family=family,
                category=services[0].category,
                label=SERVICE_FAMILY_LABELS.get(family, family.replace("_", " ").title()),
                services=sorted(services, key=lambda item: item.provider.value),
            )
        )

    comparison_groups.sort(key=lambda item: (item.category.value, item.label))
    return comparison_groups
