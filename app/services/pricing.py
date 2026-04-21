from app.models import (
    ArchitectureRecommendation,
    AvailabilityTier,
    BudgetPreference,
    CatalogService,
    CloudProvider,
    PricingDimension,
    PricingSource,
    RecommendationRequest,
    SelectiveServicePreference,
    ServiceEstimate,
    WorkloadType,
)
from app.services.catalog import get_catalog_services
from app.services.verification import build_accuracy_summary, build_service_accuracy


def format_workload_label(workload: WorkloadType) -> str:
    return workload.value.replace("_", " ").title()


PROVIDER_SERVICES: dict[
    CloudProvider, dict[WorkloadType, list[tuple[str, str, float]]]
] = {
    CloudProvider.AWS: {
        WorkloadType.ERP: [
            ("Amazon ECS", "Run ERP application containers", 180.0),
            ("Amazon RDS PostgreSQL", "Primary transactional database", 240.0),
            ("Amazon S3", "Backups and document storage", 35.0),
        ],
        WorkloadType.APPLICATION: [
            ("AWS Fargate", "Run stateless application services", 110.0),
            ("Amazon RDS MySQL", "Managed application database", 120.0),
            ("Amazon CloudFront", "Traffic acceleration and caching", 28.0),
        ],
        WorkloadType.CRM: [
            ("Amazon ECS", "Run CRM application services", 140.0),
            ("Amazon Aurora PostgreSQL", "Managed CRM database", 210.0),
            ("Amazon S3", "Attachment storage and exports", 32.0),
        ],
    },
    CloudProvider.AZURE: {
        WorkloadType.ERP: [
            ("Azure App Service", "Run ERP web and API workloads", 170.0),
            ("Azure SQL Database", "Primary transactional database", 255.0),
            ("Azure Blob Storage", "Backups and document storage", 38.0),
        ],
        WorkloadType.APPLICATION: [
            ("Azure Container Apps", "Run stateless application services", 105.0),
            ("Azure Database for PostgreSQL", "Managed application database", 125.0),
            ("Azure Front Door", "Traffic acceleration and caching", 26.0),
        ],
        WorkloadType.CRM: [
            ("Azure App Service", "Run CRM application services", 145.0),
            ("Azure SQL Database", "Managed CRM database", 220.0),
            ("Azure Blob Storage", "Attachment storage and exports", 34.0),
        ],
    },
    CloudProvider.GCP: {
        WorkloadType.ERP: [
            ("Google Kubernetes Engine", "Run ERP application containers", 190.0),
            ("Cloud SQL for PostgreSQL", "Primary transactional database", 235.0),
            ("Cloud Storage", "Backups and document storage", 30.0),
        ],
        WorkloadType.APPLICATION: [
            ("Cloud Run", "Run stateless application services", 98.0),
            ("Cloud SQL for MySQL", "Managed application database", 118.0),
            ("Cloud CDN", "Traffic acceleration and caching", 24.0),
        ],
        WorkloadType.CRM: [
            ("Cloud Run", "Run CRM application services", 130.0),
            ("Cloud SQL for PostgreSQL", "Managed CRM database", 205.0),
            ("Cloud Storage", "Attachment storage and exports", 29.0),
        ],
    },
    CloudProvider.ORACLE: {
        WorkloadType.ERP: [
            ("Oracle Kubernetes Engine", "Run ERP application services", 175.0),
            ("Autonomous Database", "Primary transactional database", 225.0),
            ("OCI Object Storage", "Backups and document storage", 31.0),
        ],
        WorkloadType.APPLICATION: [
            ("Container Instances", "Run stateless application services", 102.0),
            ("MySQL HeatWave", "Managed application database", 122.0),
            ("OCI Load Balancer", "Traffic distribution and caching edge", 29.0),
        ],
        WorkloadType.CRM: [
            ("Oracle Kubernetes Engine", "Run CRM application services", 138.0),
            ("Autonomous Transaction Processing", "Managed CRM database", 214.0),
            ("OCI Object Storage", "Attachment storage and exports", 30.0),
        ],
    },
    CloudProvider.ALIBABA: {
        WorkloadType.ERP: [
            ("Alibaba ACK", "Run ERP application containers", 162.0),
            ("ApsaraDB RDS", "Primary transactional database", 214.0),
            ("Alibaba OSS", "Backups and document storage", 27.0),
        ],
        WorkloadType.APPLICATION: [
            ("Elastic Container Instance", "Run stateless application services", 94.0),
            ("ApsaraDB for PostgreSQL", "Managed application database", 112.0),
            ("Alibaba CDN", "Traffic acceleration and caching", 22.0),
        ],
        WorkloadType.CRM: [
            ("Alibaba ACK", "Run CRM application services", 126.0),
            ("ApsaraDB PolarDB", "Managed CRM database", 198.0),
            ("Alibaba OSS", "Attachment storage and exports", 26.0),
        ],
    },
    CloudProvider.IBM: {
        WorkloadType.ERP: [
            ("Red Hat OpenShift on IBM Cloud", "Run ERP application containers", 196.0),
            ("Db2 on Cloud", "Primary transactional database", 248.0),
            ("IBM Cloud Object Storage", "Backups and document storage", 34.0),
        ],
        WorkloadType.APPLICATION: [
            ("Code Engine", "Run stateless application services", 104.0),
            ("Databases for PostgreSQL", "Managed application database", 127.0),
            ("IBM Cloud Internet Services", "Traffic acceleration and caching", 27.0),
        ],
        WorkloadType.CRM: [
            ("Red Hat OpenShift on IBM Cloud", "Run CRM application services", 148.0),
            ("Databases for PostgreSQL", "Managed CRM database", 222.0),
            ("IBM Cloud Object Storage", "Attachment storage and exports", 33.0),
        ],
    },
    CloudProvider.TENCENT: {
        WorkloadType.ERP: [
            ("Tencent Kubernetes Engine", "Run ERP application containers", 166.0),
            ("TencentDB for PostgreSQL", "Primary transactional database", 216.0),
            ("Tencent Cloud Object Storage", "Backups and document storage", 28.0),
        ],
        WorkloadType.APPLICATION: [
            ("Serverless Cloud Function", "Run stateless application services", 92.0),
            ("TencentDB for MySQL", "Managed application database", 114.0),
            ("Tencent EdgeOne", "Traffic acceleration and caching", 23.0),
        ],
        WorkloadType.CRM: [
            ("Tencent Kubernetes Engine", "Run CRM application services", 132.0),
            ("TencentDB", "Managed CRM database", 202.0),
            ("Tencent Cloud Object Storage", "Attachment storage and exports", 27.0),
        ],
    },
    CloudProvider.DIGITALOCEAN: {
        WorkloadType.ERP: [
            ("DigitalOcean Kubernetes", "Run ERP application services", 154.0),
            ("Managed PostgreSQL", "Primary transactional database", 198.0),
            ("Spaces Object Storage", "Backups and document storage", 24.0),
        ],
        WorkloadType.APPLICATION: [
            ("App Platform", "Run stateless application services", 88.0),
            ("Managed PostgreSQL", "Managed application database", 102.0),
            ("Load Balancers", "Traffic acceleration and routing", 20.0),
        ],
        WorkloadType.CRM: [
            ("DigitalOcean Kubernetes", "Run CRM application services", 118.0),
            ("Managed PostgreSQL", "Managed CRM database", 184.0),
            ("Spaces Object Storage", "Attachment storage and exports", 23.0),
        ],
    },
    CloudProvider.AKAMAI: {
        WorkloadType.ERP: [
            ("Akamai Kubernetes Engine", "Run ERP application services", 158.0),
            ("Managed Databases", "Primary transactional database", 204.0),
            ("Akamai Object Storage", "Backups and document storage", 26.0),
        ],
        WorkloadType.APPLICATION: [
            ("Akamai App Platform", "Run stateless application services", 91.0),
            ("Managed Databases", "Managed application database", 108.0),
            ("Akamai Application Load Balancer", "Traffic acceleration and routing", 23.0),
        ],
        WorkloadType.CRM: [
            ("Akamai Kubernetes Engine", "Run CRM application services", 121.0),
            ("Managed Databases", "Managed CRM database", 190.0),
            ("Akamai Object Storage", "Attachment storage and exports", 24.0),
        ],
    },
    CloudProvider.OVHCLOUD: {
        WorkloadType.ERP: [
            ("OVHcloud Managed Kubernetes", "Run ERP application services", 149.0),
            ("OVHcloud Managed Databases", "Primary transactional database", 193.0),
            ("OVHcloud Object Storage", "Backups and document storage", 24.0),
        ],
        WorkloadType.APPLICATION: [
            ("Public Cloud Instances", "Run stateless application services", 86.0),
            ("OVHcloud Managed Databases", "Managed application database", 99.0),
            ("OVHcloud Load Balancer", "Traffic acceleration and routing", 19.0),
        ],
        WorkloadType.CRM: [
            ("OVHcloud Managed Kubernetes", "Run CRM application services", 114.0),
            ("OVHcloud Managed Databases", "Managed CRM database", 178.0),
            ("OVHcloud Object Storage", "Attachment storage and exports", 22.0),
        ],
    },
    CloudProvider.CLOUDFLARE: {
        WorkloadType.ERP: [
            ("Cloudflare Workers", "Run ERP edge and API services", 112.0),
            ("Cloudflare D1", "Primary transactional database", 162.0),
            ("Cloudflare R2", "Backups and document storage", 20.0),
        ],
        WorkloadType.APPLICATION: [
            ("Cloudflare Workers", "Run stateless application services", 78.0),
            ("Cloudflare D1", "Managed application database", 88.0),
            ("Cloudflare CDN and Load Balancer", "Traffic acceleration and caching", 18.0),
        ],
        WorkloadType.CRM: [
            ("Cloudflare Workers", "Run CRM application services", 104.0),
            ("Cloudflare D1", "Managed CRM database", 150.0),
            ("Cloudflare R2", "Attachment storage and exports", 18.0),
        ],
    },
    CloudProvider.SALESFORCE: {
        WorkloadType.ERP: [
            ("Salesforce Platform", "Run ERP process extensions and workflows", 168.0),
            ("Salesforce Data Cloud", "Primary transactional database", 236.0),
            ("Salesforce Files", "Backups and document storage", 36.0),
        ],
        WorkloadType.APPLICATION: [
            ("Heroku Runtime", "Run stateless application services", 116.0),
            ("Salesforce Data Cloud", "Managed application database", 192.0),
            ("Salesforce Edge Network", "Traffic acceleration and caching", 28.0),
        ],
        WorkloadType.CRM: [
            ("Sales Cloud", "Run CRM application services", 198.0),
            ("Salesforce Data Cloud", "Managed CRM database", 248.0),
            ("Salesforce Files", "Attachment storage and exports", 42.0),
        ],
    },
    CloudProvider.SNOWFLAKE: {
        WorkloadType.ERP: [
            ("Snowpark Container Services", "Run ERP data processing services", 182.0),
            ("Snowflake Hybrid Tables", "Primary transactional database", 244.0),
            ("Snowflake Stages", "Backups and document storage", 34.0),
        ],
        WorkloadType.APPLICATION: [
            ("Snowpark Container Services", "Run stateless application services", 124.0),
            ("Snowflake Hybrid Tables", "Managed application database", 208.0),
            ("Snowflake Secure Data Sharing", "Traffic acceleration and data delivery", 30.0),
        ],
        WorkloadType.CRM: [
            ("Snowflake Native App Framework", "Run CRM application services", 176.0),
            ("Snowflake Data Cloud", "Managed CRM database", 232.0),
            ("Snowflake Stages", "Attachment storage and exports", 31.0),
        ],
    },
}


PROVIDER_WEIGHT: dict[CloudProvider, dict[WorkloadType, float]] = {
    CloudProvider.AWS: {WorkloadType.ERP: 1.0, WorkloadType.APPLICATION: 1.05, WorkloadType.CRM: 1.0},
    CloudProvider.AZURE: {WorkloadType.ERP: 1.08, WorkloadType.APPLICATION: 0.97, WorkloadType.CRM: 1.1},
    CloudProvider.GCP: {WorkloadType.ERP: 0.95, WorkloadType.APPLICATION: 1.08, WorkloadType.CRM: 0.96},
    CloudProvider.ORACLE: {WorkloadType.ERP: 1.06, WorkloadType.APPLICATION: 0.94, WorkloadType.CRM: 0.95},
    CloudProvider.ALIBABA: {WorkloadType.ERP: 0.9, WorkloadType.APPLICATION: 1.0, WorkloadType.CRM: 0.92},
    CloudProvider.IBM: {WorkloadType.ERP: 1.02, WorkloadType.APPLICATION: 0.93, WorkloadType.CRM: 0.97},
    CloudProvider.TENCENT: {WorkloadType.ERP: 0.91, WorkloadType.APPLICATION: 0.99, WorkloadType.CRM: 0.93},
    CloudProvider.DIGITALOCEAN: {WorkloadType.ERP: 0.84, WorkloadType.APPLICATION: 1.02, WorkloadType.CRM: 0.88},
    CloudProvider.AKAMAI: {WorkloadType.ERP: 0.86, WorkloadType.APPLICATION: 1.0, WorkloadType.CRM: 0.89},
    CloudProvider.OVHCLOUD: {WorkloadType.ERP: 0.83, WorkloadType.APPLICATION: 0.97, WorkloadType.CRM: 0.87},
    CloudProvider.CLOUDFLARE: {WorkloadType.ERP: 0.8, WorkloadType.APPLICATION: 1.06, WorkloadType.CRM: 0.85},
    CloudProvider.SALESFORCE: {WorkloadType.ERP: 0.94, WorkloadType.APPLICATION: 1.04, WorkloadType.CRM: 1.16},
    CloudProvider.SNOWFLAKE: {WorkloadType.ERP: 1.07, WorkloadType.APPLICATION: 1.1, WorkloadType.CRM: 0.99},
}

WORKLOAD_ARCHETYPE: dict[WorkloadType, WorkloadType] = {
    WorkloadType.ERP: WorkloadType.ERP,
    WorkloadType.APPLICATION: WorkloadType.APPLICATION,
    WorkloadType.CRM: WorkloadType.CRM,
    WorkloadType.ECOMMERCE: WorkloadType.APPLICATION,
    WorkloadType.ANALYTICS: WorkloadType.ERP,
    WorkloadType.AI_ML: WorkloadType.APPLICATION,
    WorkloadType.VDI: WorkloadType.ERP,
    WorkloadType.DEV_TEST: WorkloadType.APPLICATION,
    WorkloadType.WEB_API: WorkloadType.APPLICATION,
    WorkloadType.SAAS: WorkloadType.CRM,
}

WORKLOAD_COST_MULTIPLIER: dict[WorkloadType, float] = {
    WorkloadType.ERP: 1.0,
    WorkloadType.APPLICATION: 1.0,
    WorkloadType.CRM: 1.0,
    WorkloadType.ECOMMERCE: 1.14,
    WorkloadType.ANALYTICS: 1.18,
    WorkloadType.AI_ML: 1.24,
    WorkloadType.VDI: 1.2,
    WorkloadType.DEV_TEST: 0.76,
    WorkloadType.WEB_API: 0.92,
    WorkloadType.SAAS: 1.08,
}

WORKLOAD_SERVICE_FAMILIES: dict[WorkloadType, list[str]] = {
    WorkloadType.ERP: ["containers_managed", "relational_database", "object_storage"],
    WorkloadType.APPLICATION: ["serverless_runtime", "relational_database", "content_delivery"],
    WorkloadType.CRM: ["containers_managed", "relational_database", "object_storage"],
}

FAMILY_PURPOSE_OVERRIDES: dict[str, str] = {
    "virtual_machine": "General-purpose workload compute tier",
    "containers_managed": "Managed application execution tier",
    "serverless_runtime": "Elastic request-driven application tier",
    "object_storage": "Backups, attachments, and unstructured storage",
    "block_storage": "Persistent block storage for attached compute",
    "relational_database": "Primary transactional data tier",
    "nosql_database": "High-scale key-value or document persistence",
    "load_balancer": "Traffic distribution and high-availability entry point",
    "content_delivery": "Edge acceleration and caching layer",
    "data_warehouse": "Analytical storage and reporting tier",
    "stream_analytics": "Streaming ingest and event processing",
    "generative_ai": "Generative AI request processing",
    "vision_ai": "Image and OCR processing",
    "key_management": "Encryption and key lifecycle management",
    "web_application_firewall": "Public web protection controls",
}


def resolve_workload_archetype(workload: WorkloadType) -> WorkloadType:
    return WORKLOAD_ARCHETYPE[workload]


def estimate_services(
    request: RecommendationRequest, provider: CloudProvider
) -> list[ServiceEstimate]:
    archetype = resolve_workload_archetype(request.workload_type)
    if request.enable_decoupled_compute and request.selective_services:
        decoupled_services = _estimate_decoupled_services(request, provider, archetype)
        if decoupled_services:
            return decoupled_services

    return _estimate_single_provider_services(request, provider, archetype)


def _estimate_single_provider_services(
    request: RecommendationRequest,
    provider: CloudProvider,
    archetype: WorkloadType,
) -> list[ServiceEstimate]:
    catalog_services = _estimate_catalog_services(request, provider, archetype)
    if catalog_services:
        return catalog_services
    return _estimate_profile_services(request, provider, archetype)


def _estimate_profile_services(
    request: RecommendationRequest,
    provider: CloudProvider,
    archetype: WorkloadType,
) -> list[ServiceEstimate]:
    base_services = PROVIDER_SERVICES[provider][archetype]
    scaled_services: list[ServiceEstimate] = []

    usage_factor = max(request.concurrent_users / 50, 1.0)
    storage_factor = max(request.storage_gb / 250, 1.0)
    request_factor = max(request.monthly_requests_million / 2, 1.0)

    availability_multiplier = {
        AvailabilityTier.STANDARD: 1.0,
        AvailabilityTier.HIGH: 1.2,
        AvailabilityTier.MISSION_CRITICAL: 1.45,
    }[request.availability_tier]

    database_multiplier = 1.0 if request.requires_managed_database else 0.7
    disaster_recovery_multiplier = 1.15 if request.requires_disaster_recovery else 1.0
    workload_multiplier = WORKLOAD_COST_MULTIPLIER[request.workload_type]

    for name, purpose, base_cost in base_services:
        service_multiplier = availability_multiplier * disaster_recovery_multiplier
        lowered_purpose = purpose.lower()

        if "database" in lowered_purpose:
            service_multiplier *= max(usage_factor, storage_factor) * database_multiplier
        elif "storage" in lowered_purpose or "backup" in lowered_purpose:
            service_multiplier *= storage_factor
        else:
            service_multiplier *= max(usage_factor, request_factor)

        scaled_services.append(
            ServiceEstimate(
                provider=provider,
                service_code=None,
                name=name,
                purpose=purpose,
                estimated_monthly_cost_usd=round(base_cost * service_multiplier * workload_multiplier, 2),
            )
        )

    return scaled_services


def _estimate_decoupled_services(
    request: RecommendationRequest,
    default_provider: CloudProvider,
    archetype: WorkloadType,
) -> list[ServiceEstimate]:
    service_families = WORKLOAD_SERVICE_FAMILIES.get(archetype, [])
    if not service_families:
        return []

    family_overrides = _build_family_provider_overrides(
        request.selective_services,
        archetype,
    )
    selected_services: list[ServiceEstimate] = []

    for family in service_families:
        target_provider = family_overrides.get(family, default_provider)
        service = _estimate_service_for_family(request, target_provider, archetype, family)
        if service is None:
            continue
        selected_services.append(service)

    active_providers = {service.provider for service in selected_services if service.provider is not None}
    if len(active_providers) > 1:
        coordination_cost = round(sum(service.estimated_monthly_cost_usd for service in selected_services) * 0.04, 2)
        selected_services.append(
            ServiceEstimate(
                provider=default_provider,
                service_code=None,
                name="Cross-cloud control plane",
                purpose="Coordinates decoupled compute and shared observability across selected clouds.",
                estimated_monthly_cost_usd=coordination_cost,
                pricing_source=PricingSource.GENERATED,
            )
        )

    return selected_services


def _build_family_provider_overrides(
    selective_services: list[SelectiveServicePreference],
    archetype: WorkloadType,
) -> dict[str, CloudProvider]:
    service_families = set(WORKLOAD_SERVICE_FAMILIES.get(archetype, []))
    alias_map: dict[str, set[str]] = {
        "compute": {"compute", "containers_managed", "serverless_runtime", "virtual_machine"},
        "database": {"database", "relational_database", "nosql_database"},
        "storage": {"storage", "object_storage", "block_storage"},
        "edge": {"edge", "content_delivery", "load_balancer", "web_application_firewall"},
    }
    overrides: dict[str, CloudProvider] = {}
    for selection in selective_services:
        if isinstance(selection, dict):
            raw_provider = selection.get("provider")
            raw_family = selection.get("service_family")
            if not isinstance(raw_provider, CloudProvider):
                try:
                    provider = CloudProvider(str(raw_provider))
                except ValueError:
                    continue
            else:
                provider = raw_provider
            if not isinstance(raw_family, str):
                continue
            family = raw_family
        else:
            provider = selection.provider
            family = selection.service_family

        family = family.strip().lower()
        expanded_families = {family}
        for candidates in alias_map.values():
            if family in candidates:
                expanded_families = expanded_families.union(candidates)
                break

        for expanded in expanded_families:
            if not service_families or expanded in service_families:
                overrides[expanded] = provider
    return overrides


def _estimate_service_for_family(
    request: RecommendationRequest,
    provider: CloudProvider,
    archetype: WorkloadType,
    service_family: str,
) -> ServiceEstimate | None:
    catalog = get_catalog_services(provider=provider)
    catalog_service = next((service for service in catalog if service.service_family == service_family), None)
    if catalog_service and catalog_service.pricing_source != PricingSource.GENERATED:
        return ServiceEstimate(
            provider=provider,
            service_code=catalog_service.service_code,
            name=catalog_service.name,
            purpose=FAMILY_PURPOSE_OVERRIDES.get(catalog_service.service_family, catalog_service.summary),
            estimated_monthly_cost_usd=round(
                _estimate_catalog_service_monthly_cost(request, catalog_service),
                2,
            ),
            pricing_source=catalog_service.pricing_source,
            last_validated_at=catalog_service.last_validated_at,
        )

    fallback_services = _estimate_profile_services(request, provider, archetype)
    archetype_families = WORKLOAD_SERVICE_FAMILIES.get(archetype, [])
    if service_family in archetype_families:
        index = archetype_families.index(service_family)
        if index < len(fallback_services):
            return fallback_services[index].model_copy(update={"provider": provider})

    if fallback_services:
        return fallback_services[0].model_copy(update={"provider": provider})
    return None


def profile_name(preference: BudgetPreference) -> str:
    return {
        BudgetPreference.LOWEST_COST: "lowest-cost",
        BudgetPreference.BALANCED: "balanced",
        BudgetPreference.ENTERPRISE: "enterprise",
    }[preference]


def score_recommendation(
    request: RecommendationRequest, provider: CloudProvider, monthly_cost: float
) -> float:
    budget_bias = {
        BudgetPreference.LOWEST_COST: 0.4,
        BudgetPreference.BALANCED: 0.25,
        BudgetPreference.ENTERPRISE: 0.1,
    }[request.budget_preference]

    reliability_bonus = {
        AvailabilityTier.STANDARD: 4.0,
        AvailabilityTier.HIGH: 8.0,
        AvailabilityTier.MISSION_CRITICAL: 12.0,
    }[request.availability_tier]

    provider_fit = PROVIDER_WEIGHT[provider][resolve_workload_archetype(request.workload_type)] * 20
    cost_component = max(0.0, 100 - (monthly_cost * budget_bias / 10))
    return round(provider_fit + cost_component + reliability_bonus, 2)


def build_architecture(
    request: RecommendationRequest, provider: CloudProvider
) -> ArchitectureRecommendation:
    services = estimate_services(request, provider)
    services = [
        service.model_copy(
            update={
                "accuracy": build_service_accuracy(
                    service.provider or provider,
                    request.workload_type,
                    service,
                )
            }
        )
        for service in services
    ]
    total_cost = round(sum(item.estimated_monthly_cost_usd for item in services), 2)
    score = score_recommendation(request, provider, total_cost)
    accuracy = build_accuracy_summary(provider, request.workload_type, services)

    rationale = [
        f"Estimated monthly cost reflects {request.concurrent_users} concurrent users and {request.storage_gb} GB of storage.",
        f"{provider.value.upper()} fit score is tuned for {format_workload_label(request.workload_type)} workloads.",
    ]
    archetype = resolve_workload_archetype(request.workload_type)
    if archetype != request.workload_type:
        rationale.append(
            f"Service selection is adapted from the {format_workload_label(archetype)} archetype for this workload profile."
        )
    if request.requires_disaster_recovery:
        rationale.append("Pricing includes a disaster recovery overhead.")
    if request.requires_managed_database:
        rationale.append("Recommendation prefers managed database services to reduce operations.")
    providers_in_plan = sorted({service.provider for service in services if service.provider is not None}, key=lambda item: item.value)
    if request.enable_decoupled_compute and len(providers_in_plan) > 1:
        rationale.append(
            "Decoupled compute mode is active with selective services across "
            + ", ".join(item.value.upper() for item in providers_in_plan)
            + "."
        )

    return ArchitectureRecommendation(
        provider=provider,
        profile=profile_name(request.budget_preference),
        score=score,
        estimated_monthly_cost_usd=total_cost,
        rationale=rationale,
        services=services,
        accuracy=accuracy,
    )


def _estimate_catalog_services(
    request: RecommendationRequest,
    provider: CloudProvider,
    archetype: WorkloadType,
) -> list[ServiceEstimate]:
    catalog = get_catalog_services(provider=provider)
    if not catalog:
        return []

    family_map = {service.service_family: service for service in catalog}
    service_families = WORKLOAD_SERVICE_FAMILIES.get(archetype, [])
    selected_services: list[CatalogService] = [
        family_map[family]
        for family in service_families
        if family in family_map
    ]
    if not selected_services:
        return []
    if any(service.pricing_source == PricingSource.GENERATED for service in selected_services):
        # Generated catalog entries are synthetic comparison placeholders, not
        # provider-backed price points. Fall back to the explicit provider
        # workload profiles instead of treating generated services as real.
        return []

    return [
        ServiceEstimate(
            provider=provider,
            service_code=service.service_code,
            name=service.name,
            purpose=FAMILY_PURPOSE_OVERRIDES.get(service.service_family, service.summary),
            estimated_monthly_cost_usd=round(_estimate_catalog_service_monthly_cost(request, service), 2),
            pricing_source=service.pricing_source,
            last_validated_at=service.last_validated_at,
        )
        for service in selected_services
    ]


def _estimate_catalog_service_monthly_cost(
    request: RecommendationRequest,
    service: CatalogService,
) -> float:
    estimated_cost = service.base_monthly_cost_usd
    for dimension in service.dimensions:
        quantity = _dimension_quantity(request, service, dimension)
        estimated_cost += quantity * dimension.rate_per_unit_usd

    availability_multiplier = {
        AvailabilityTier.STANDARD: 1.0,
        AvailabilityTier.HIGH: 1.12,
        AvailabilityTier.MISSION_CRITICAL: 1.28,
    }[request.availability_tier]
    if request.requires_disaster_recovery:
        availability_multiplier *= 1.15
    if service.service_family == "relational_database" and not request.requires_managed_database:
        availability_multiplier *= 0.82

    return estimated_cost * availability_multiplier * WORKLOAD_COST_MULTIPLIER[request.workload_type]


def _dimension_quantity(
    request: RecommendationRequest,
    service: CatalogService,
    dimension: PricingDimension,
) -> float:
    key = dimension.key
    if key in {"storage_gb", "memory_gb"}:
        return max(dimension.suggested_value, float(request.storage_gb if key == "storage_gb" else max(request.concurrent_users / 8, 8)))
    if key in {"retrieval_gb"}:
        return max(dimension.suggested_value, float(request.storage_gb) * 0.2)
    if key in {"requests_million"}:
        return max(dimension.suggested_value, request.monthly_requests_million)
    if key in {"gb_seconds_million", "memory_gb_seconds_million"}:
        return max(dimension.suggested_value, round(request.monthly_requests_million * max(request.concurrent_users / 50, 1.0), 2))
    if key in {"vcpu_seconds_million"}:
        return max(dimension.suggested_value, round(request.monthly_requests_million * max(request.concurrent_users / 80, 0.5), 2))
    if key in {"instance_hours", "cluster_hours", "node_hours", "vcpu_hours"}:
        return max(dimension.suggested_value, 730.0 * max(request.concurrent_users / 50, 1.0))
    if key in {"vcpu_count"}:
        return max(dimension.suggested_value, float(max(round(request.concurrent_users / 40), 2)))
    return dimension.suggested_value
