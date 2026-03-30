from app.models import (
    ArchitectureRecommendation,
    AvailabilityTier,
    BudgetPreference,
    CloudProvider,
    RecommendationRequest,
    ServiceEstimate,
    WorkloadType,
)


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
}


def estimate_services(
    request: RecommendationRequest, provider: CloudProvider
) -> list[ServiceEstimate]:
    base_services = PROVIDER_SERVICES[provider][request.workload_type]
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
                name=name,
                purpose=purpose,
                estimated_monthly_cost_usd=round(base_cost * service_multiplier, 2),
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
