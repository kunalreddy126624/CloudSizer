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
    CloudProvider.ORACLE: ProviderSummary(
        provider=CloudProvider.ORACLE,
        strengths=["Strong database portfolio", "Good fit for enterprise apps"],
        default_regions=["us-ashburn-1", "ap-mumbai-1", "eu-frankfurt-1"],
    ),
    CloudProvider.ALIBABA: ProviderSummary(
        provider=CloudProvider.ALIBABA,
        strengths=["Broad APAC coverage", "Competitive infrastructure pricing"],
        default_regions=["ap-southeast-1", "cn-hongkong", "eu-central-1"],
    ),
    CloudProvider.IBM: ProviderSummary(
        provider=CloudProvider.IBM,
        strengths=["Hybrid and OpenShift alignment", "Strong regulated-industry posture"],
        default_regions=["us-south", "eu-de", "jp-tok"],
    ),
    CloudProvider.TENCENT: ProviderSummary(
        provider=CloudProvider.TENCENT,
        strengths=["China and APAC footprint", "Balanced compute and database services"],
        default_regions=["ap-mumbai", "ap-singapore", "na-ashburn"],
    ),
    CloudProvider.DIGITALOCEAN: ProviderSummary(
        provider=CloudProvider.DIGITALOCEAN,
        strengths=["Operational simplicity", "Straightforward developer platform"],
        default_regions=["blr1", "sgp1", "nyc1"],
    ),
    CloudProvider.AKAMAI: ProviderSummary(
        provider=CloudProvider.AKAMAI,
        strengths=["Edge reach", "Developer-friendly infrastructure"],
        default_regions=["in-maa", "us-iad", "eu-fra"],
    ),
    CloudProvider.OVHCLOUD: ProviderSummary(
        provider=CloudProvider.OVHCLOUD,
        strengths=["European footprint", "Cost-efficient infrastructure"],
        default_regions=["IN-MUM", "GRA", "DE1"],
    ),
    CloudProvider.CLOUDFLARE: ProviderSummary(
        provider=CloudProvider.CLOUDFLARE,
        strengths=["Edge-native services", "Security and network acceleration"],
        default_regions=["global", "apac", "europe"],
    ),
}

PROVIDER_LABELS: dict[CloudProvider, str] = {
    CloudProvider.AWS: "AWS",
    CloudProvider.AZURE: "Azure",
    CloudProvider.GCP: "GCP",
    CloudProvider.ORACLE: "Oracle Cloud",
    CloudProvider.ALIBABA: "Alibaba Cloud",
    CloudProvider.IBM: "IBM Cloud",
    CloudProvider.TENCENT: "Tencent Cloud",
    CloudProvider.DIGITALOCEAN: "DigitalOcean",
    CloudProvider.AKAMAI: "Akamai Cloud",
    CloudProvider.OVHCLOUD: "OVHcloud",
    CloudProvider.CLOUDFLARE: "Cloudflare",
}

GENERATED_PROVIDER_SERVICE_NAMES: dict[CloudProvider, dict[str, str]] = {
    CloudProvider.ORACLE: {
        "virtual_machine": "OCI Compute",
        "containers_managed": "Oracle Kubernetes Engine",
        "serverless_runtime": "OCI Functions",
        "object_storage": "OCI Object Storage",
        "block_storage": "OCI Block Volumes",
        "relational_database": "Autonomous Database",
        "nosql_database": "OCI NoSQL Database",
        "load_balancer": "OCI Load Balancer",
        "content_delivery": "OCI CDN",
        "data_warehouse": "Autonomous Data Warehouse",
        "stream_analytics": "OCI Streaming",
        "generative_ai": "OCI Generative AI",
        "vision_ai": "OCI Vision",
        "key_management": "OCI Vault",
        "web_application_firewall": "OCI Web Application Firewall",
    },
    CloudProvider.ALIBABA: {
        "virtual_machine": "Elastic Compute Service",
        "containers_managed": "Container Service for Kubernetes",
        "serverless_runtime": "Function Compute",
        "object_storage": "Object Storage Service",
        "block_storage": "Elastic Block Storage",
        "relational_database": "ApsaraDB RDS",
        "nosql_database": "Tablestore",
        "load_balancer": "Server Load Balancer",
        "content_delivery": "Alibaba Cloud CDN",
        "data_warehouse": "MaxCompute",
        "stream_analytics": "Realtime Compute for Apache Flink",
        "generative_ai": "Platform for AI",
        "vision_ai": "Visual Intelligence",
        "key_management": "Key Management Service",
        "web_application_firewall": "Alibaba Cloud WAF",
    },
    CloudProvider.IBM: {
        "virtual_machine": "Virtual Servers for VPC",
        "containers_managed": "Red Hat OpenShift on IBM Cloud",
        "serverless_runtime": "IBM Cloud Code Engine",
        "object_storage": "IBM Cloud Object Storage",
        "block_storage": "IBM Cloud Block Storage",
        "relational_database": "Db2 on Cloud",
        "nosql_database": "IBM Cloudant",
        "load_balancer": "IBM Cloud Load Balancer",
        "content_delivery": "IBM Cloud CDN",
        "data_warehouse": "watsonx.data",
        "stream_analytics": "Event Streams",
        "generative_ai": "watsonx.ai",
        "vision_ai": "Watson Visual Recognition",
        "key_management": "IBM Key Protect",
        "web_application_firewall": "IBM Cloud Internet Services",
    },
    CloudProvider.TENCENT: {
        "virtual_machine": "Cloud Virtual Machine",
        "containers_managed": "Tencent Kubernetes Engine",
        "serverless_runtime": "Serverless Cloud Function",
        "object_storage": "Cloud Object Storage",
        "block_storage": "Cloud Block Storage",
        "relational_database": "TencentDB for MySQL",
        "nosql_database": "TencentDB for MongoDB",
        "load_balancer": "Cloud Load Balancer",
        "content_delivery": "Tencent Cloud CDN",
        "data_warehouse": "Tencent Data Warehouse",
        "stream_analytics": "CKafka",
        "generative_ai": "Tencent Hunyuan",
        "vision_ai": "Tencent Cloud Visual Intelligence",
        "key_management": "Key Management Service",
        "web_application_firewall": "Tencent Cloud WAF",
    },
    CloudProvider.DIGITALOCEAN: {
        "virtual_machine": "Droplets",
        "containers_managed": "DigitalOcean Kubernetes",
        "serverless_runtime": "Functions",
        "object_storage": "Spaces Object Storage",
        "block_storage": "Block Storage Volumes",
        "relational_database": "Managed PostgreSQL",
        "nosql_database": "Managed Redis",
        "load_balancer": "DigitalOcean Load Balancer",
        "content_delivery": "DigitalOcean CDN",
        "data_warehouse": "Managed OpenSearch",
        "stream_analytics": "Managed Kafka",
        "generative_ai": "DigitalOcean GenAI Platform",
        "vision_ai": "Paperspace Vision",
        "key_management": "DigitalOcean Key Management",
        "web_application_firewall": "Cloud Firewalls",
    },
    CloudProvider.AKAMAI: {
        "virtual_machine": "Linode Compute Instances",
        "containers_managed": "Linode Kubernetes Engine",
        "serverless_runtime": "Akamai EdgeWorkers",
        "object_storage": "Linode Object Storage",
        "block_storage": "Linode Block Storage",
        "relational_database": "Managed Databases",
        "nosql_database": "Akamai NoSQL Database",
        "load_balancer": "NodeBalancers",
        "content_delivery": "Akamai CDN",
        "data_warehouse": "Akamai Data Warehouse",
        "stream_analytics": "Akamai DataStream 2",
        "generative_ai": "Akamai AI Inference",
        "vision_ai": "Akamai Image and Video Manager",
        "key_management": "Akamai Certificate and Key Management",
        "web_application_firewall": "App and API Protector",
    },
    CloudProvider.OVHCLOUD: {
        "virtual_machine": "Public Cloud Instances",
        "containers_managed": "Managed Kubernetes Service",
        "serverless_runtime": "OVHcloud Functions",
        "object_storage": "OVHcloud Object Storage",
        "block_storage": "OVHcloud Block Storage",
        "relational_database": "Managed Databases for PostgreSQL",
        "nosql_database": "Managed Databases for Redis",
        "load_balancer": "OVHcloud Load Balancer",
        "content_delivery": "OVHcloud CDN",
        "data_warehouse": "OVHcloud Data Platform",
        "stream_analytics": "OVHcloud Data Processing",
        "generative_ai": "OVHcloud AI Endpoints",
        "vision_ai": "OVHcloud AI Vision",
        "key_management": "OVHcloud Key Management Service",
        "web_application_firewall": "OVHcloud Network Firewall",
    },
    CloudProvider.CLOUDFLARE: {
        "virtual_machine": "Cloudflare Edge Compute",
        "containers_managed": "Cloudflare Containers",
        "serverless_runtime": "Cloudflare Workers",
        "object_storage": "Cloudflare R2",
        "block_storage": "Cloudflare Durable Objects Storage",
        "relational_database": "Cloudflare D1",
        "nosql_database": "Cloudflare KV",
        "load_balancer": "Cloudflare Load Balancer",
        "content_delivery": "Cloudflare CDN",
        "data_warehouse": "Cloudflare Analytics Engine",
        "stream_analytics": "Cloudflare Queues",
        "generative_ai": "Workers AI",
        "vision_ai": "Cloudflare Images",
        "key_management": "Cloudflare Keyless SSL",
        "web_application_firewall": "Cloudflare WAF",
    },
}

GENERATED_PROVIDER_COST_MULTIPLIERS: dict[CloudProvider, float] = {
    CloudProvider.ORACLE: 0.92,
    CloudProvider.ALIBABA: 0.88,
    CloudProvider.IBM: 1.07,
    CloudProvider.TENCENT: 0.91,
    CloudProvider.DIGITALOCEAN: 0.95,
    CloudProvider.AKAMAI: 0.97,
    CloudProvider.OVHCLOUD: 0.89,
    CloudProvider.CLOUDFLARE: 0.84,
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


def _generate_service_summary(service_family: str) -> str:
    family_label = SERVICE_FAMILY_LABELS.get(
        service_family, service_family.replace("_", " ").title()
    )
    return f"Comparable {family_label.lower()} service for multicloud planning and estimation."


def _build_generated_services(
    provider: CloudProvider,
    reference_services: dict[str, CatalogService],
    existing_families: set[str],
) -> list[CatalogService]:
    provider_names = GENERATED_PROVIDER_SERVICE_NAMES.get(provider, {})
    provider_label = PROVIDER_LABELS.get(provider, provider.value.title())
    default_region = PROVIDER_SUMMARIES[provider].default_regions[0]
    multiplier = GENERATED_PROVIDER_COST_MULTIPLIERS.get(provider, 1.0)
    generated: list[CatalogService] = []

    for family, template in reference_services.items():
        if family in existing_families:
            continue

        generated.append(
            template.model_copy(
                update={
                    "provider": provider,
                    "service_code": f"{provider.value}.{family}",
                    "name": provider_names.get(
                        family,
                        f"{provider_label} {SERVICE_FAMILY_LABELS.get(family, family.replace('_', ' ').title())}",
                    ),
                    "summary": _generate_service_summary(family),
                    "default_region": default_region,
                    "base_monthly_cost_usd": round(
                        template.base_monthly_cost_usd * multiplier, 2
                    ),
                    "dimensions": [
                        dimension.model_copy(
                            update={
                                "rate_per_unit_usd": round(
                                    dimension.rate_per_unit_usd * multiplier, 4
                                )
                            }
                        )
                        for dimension in template.dimensions
                    ],
                }
            )
        )

    return generated


@lru_cache(maxsize=1)
def _load_catalog() -> dict[CloudProvider, list[CatalogService]]:
    raw_catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    loaded: dict[CloudProvider, list[CatalogService]] = {}

    for provider_value, services in raw_catalog.items():
        provider = CloudProvider(provider_value)
        loaded[provider] = [CatalogService.model_validate(service) for service in services]

    reference_services: dict[str, CatalogService] = {}
    for services in loaded.values():
        for service in services:
            reference_services.setdefault(service.service_family, service)

    for provider in CloudProvider:
        existing_services = loaded.get(provider, [])
        existing_families = {service.service_family for service in existing_services}
        loaded[provider] = sorted(
            existing_services
            + _build_generated_services(provider, reference_services, existing_families),
            key=lambda item: (item.category.value, item.name),
        )

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
        for service in catalog.get(provider_key, []):
            if category and service.category != category:
                continue
            services.append(service)

    return services


def get_catalog_service(provider: CloudProvider, service_code: str) -> CatalogService:
    for service in _load_catalog().get(provider, []):
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
