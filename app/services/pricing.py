from app.models import (
    ArchitectureRecommendation,
    AvailabilityTier,
    BudgetPreference,
    CloudProvider,
    RecommendationRequest,
    ServiceEstimate,
    WorkloadType,
)


BASE_SERVICE_CATALOG: dict[WorkloadType, dict[CloudProvider, list[ServiceEstimate]]] = {
    WorkloadType.ERP: {
        CloudProvider.AWS: [
            ServiceEstimate(
                name="Amazon ECS",
                purpose="Run ERP application containers",
                estimated_monthly_cost_usd=180.0,
            ),
            ServiceEstimate(
                name="Amazon RDS PostgreSQL",
                purpose="Primary transactional database",
                estimated_monthly_cost_usd=240.0,
            ),
            ServiceEstimate(
                name="Amazon S3",
                purpose="Backups and document storage",
                estimated_monthly_cost_usd=35.0,
            ),
        ],
        CloudProvider.AZURE: [
            ServiceEstimate(
                name="Azure App Service",
                purpose="Run ERP web and API workloads",
                estimated_monthly_cost_usd=170.0,
            ),
            ServiceEstimate(
                name="Azure SQL Database",
                purpose="Primary transactional database",
                estimated_monthly_cost_usd=255.0,
            ),
            ServiceEstimate(
                name="Azure Blob Storage",
                purpose="Backups and document storage",
                estimated_monthly_cost_usd=38.0,
            ),
        ],
        CloudProvider.GCP: [
            ServiceEstimate(
                name="Google Kubernetes Engine",
                purpose="Run ERP application containers",
                estimated_monthly_cost_usd=190.0,
            ),
            ServiceEstimate(
                name="Cloud SQL for PostgreSQL",
                purpose="Primary transactional database",
                estimated_monthly_cost_usd=235.0,
            ),
            ServiceEstimate(
                name="Cloud Storage",
                purpose="Backups and document storage",
                estimated_monthly_cost_usd=30.0,
            ),
        ],
    },
    WorkloadType.APPLICATION: {
        CloudProvider.AWS: [
            ServiceEstimate(
                name="AWS Fargate",
                purpose="Run stateless application services",
                estimated_monthly_cost_usd=110.0,
            ),
            ServiceEstimate(
                name="Amazon RDS MySQL",
                purpose="Managed application database",
                estimated_monthly_cost_usd=120.0,
            ),
            ServiceEstimate(
                name="Amazon CloudFront",
                purpose="Traffic acceleration and caching",
                estimated_monthly_cost_usd=28.0,
            ),
        ],
        CloudProvider.AZURE: [
            ServiceEstimate(
                name="Azure Container Apps",
                purpose="Run stateless application services",
                estimated_monthly_cost_usd=105.0,
            ),
            ServiceEstimate(
                name="Azure Database for PostgreSQL",
                purpose="Managed application database",
                estimated_monthly_cost_usd=125.0,
            ),
            ServiceEstimate(
                name="Azure Front Door",
                purpose="Traffic acceleration and caching",
                estimated_monthly_cost_usd=26.0,
            ),
        ],
        CloudProvider.GCP: [
            ServiceEstimate(
                name="Cloud Run",
                purpose="Run stateless application services",
                estimated_monthly_cost_usd=98.0,
            ),
            ServiceEstimate(
                name="Cloud SQL for MySQL",
                purpose="Managed application database",
                estimated_monthly_cost_usd=118.0,
            ),
            ServiceEstimate(
                name="Cloud CDN",
                purpose="Traffic acceleration and caching",
                estimated_monthly_cost_usd=24.0,
            ),
        ],
    },
    WorkloadType.CRM: {
        CloudProvider.AWS: [
            ServiceEstimate(
                name="Amazon ECS",
                purpose="Run CRM application services",
                estimated_monthly_cost_usd=140.0,
            ),
            ServiceEstimate(
                name="Amazon Aurora PostgreSQL",
                purpose="Managed CRM database",
                estimated_monthly_cost_usd=210.0,
            ),
            ServiceEstimate(
                name="Amazon S3",
                purpose="Attachment storage and exports",
                estimated_monthly_cost_usd=32.0,
            ),
        ],
        CloudProvider.AZURE: [
            ServiceEstimate(
                name="Azure App Service",
                purpose="Run CRM application services",
                estimated_monthly_cost_usd=145.0,
            ),
            ServiceEstimate(
                name="Azure SQL Database",
                purpose="Managed CRM database",
                estimated_monthly_cost_usd=220.0,
            ),
            ServiceEstimate(
                name="Azure Blob Storage",
                purpose="Attachment storage and exports",
                estimated_monthly_cost_usd=34.0,
            ),
        ],
        CloudProvider.GCP: [
            ServiceEstimate(
                name="Cloud Run",
                purpose="Run CRM application services",
                estimated_monthly_cost_usd=130.0,
            ),
            ServiceEstimate(
                name="Cloud SQL for PostgreSQL",
                purpose="Managed CRM database",
                estimated_monthly_cost_usd=205.0,
            ),
            ServiceEstimate(
                name="Cloud Storage",
                purpose="Attachment storage and exports",
                estimated_monthly_cost_usd=29.0,
            ),
        ],
    },
}


PROVIDER_WEIGHT: dict[CloudProvider, dict[WorkloadType, float]] = {
    CloudProvider.AWS: {
        WorkloadType.ERP: 1.0,
        WorkloadType.APPLICATION: 1.05,
        WorkloadType.CRM: 1.0,
    },
    CloudProvider.AZURE: {
        WorkloadType.ERP: 1.08,
        WorkloadType.APPLICATION: 0.97,
        WorkloadType.CRM: 1.1,
    },
    CloudProvider.GCP: {
        WorkloadType.ERP: 0.95,
        WorkloadType.APPLICATION: 1.08,
        WorkloadType.CRM: 0.96,
    },
}


def estimate_services(
    request: RecommendationRequest, provider: CloudProvider
) -> list[ServiceEstimate]:
    base_services = BASE_SERVICE_CATALOG[request.workload_type][provider]
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

    for service in base_services:
        service_multiplier = availability_multiplier * disaster_recovery_multiplier

        if "database" in service.purpose.lower():
            service_multiplier *= max(usage_factor, storage_factor) * database_multiplier
        elif "storage" in service.purpose.lower() or "backup" in service.purpose.lower():
            service_multiplier *= storage_factor
        else:
            service_multiplier *= max(usage_factor, request_factor)

        scaled_services.append(
            ServiceEstimate(
                name=service.name,
                purpose=service.purpose,
                estimated_monthly_cost_usd=round(
                    service.estimated_monthly_cost_usd * service_multiplier, 2
                ),
            )
        )

    return scaled_services


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

    provider_fit = PROVIDER_WEIGHT[provider][request.workload_type] * 20
    cost_component = max(0.0, 100 - (monthly_cost * budget_bias / 10))
    return round(provider_fit + cost_component + reliability_bonus, 2)


def build_architecture(
    request: RecommendationRequest, provider: CloudProvider
) -> ArchitectureRecommendation:
    services = estimate_services(request, provider)
    total_cost = round(sum(item.estimated_monthly_cost_usd for item in services), 2)
    score = score_recommendation(request, provider, total_cost)

    rationale = [
        f"Estimated monthly cost reflects {request.concurrent_users} concurrent users and {request.storage_gb} GB of storage.",
        f"{provider.value.upper()} fit score is tuned for {request.workload_type.value} workloads.",
    ]
    if request.requires_disaster_recovery:
        rationale.append("Pricing includes a disaster recovery overhead.")
    if request.requires_managed_database:
        rationale.append("Recommendation prefers managed database services to reduce operations.")

    return ArchitectureRecommendation(
        provider=provider,
        profile=profile_name(request.budget_preference),
        score=score,
        estimated_monthly_cost_usd=total_cost,
        rationale=rationale,
        services=services,
    )
