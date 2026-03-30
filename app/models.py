from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, PositiveInt


class WorkloadType(str, Enum):
    ERP = "erp"
    APPLICATION = "application"
    CRM = "crm"


class AvailabilityTier(str, Enum):
    STANDARD = "standard"
    HIGH = "high"
    MISSION_CRITICAL = "mission_critical"


class BudgetPreference(str, Enum):
    LOWEST_COST = "lowest_cost"
    BALANCED = "balanced"
    ENTERPRISE = "enterprise"


class CloudProvider(str, Enum):
    AWS = "aws"
    AZURE = "azure"
    GCP = "gcp"
    ORACLE = "oracle"
    ALIBABA = "alibaba"
    IBM = "ibm"
    TENCENT = "tencent"
    DIGITALOCEAN = "digitalocean"
    AKAMAI = "akamai"
    OVHCLOUD = "ovhcloud"
    CLOUDFLARE = "cloudflare"


class ServiceCategory(str, Enum):
    COMPUTE = "compute"
    STORAGE = "storage"
    DATABASE = "database"
    NETWORKING = "networking"
    ANALYTICS = "analytics"
    AI_ML = "ai_ml"
    SECURITY = "security"


class EstimateType(str, Enum):
    ADVISOR_PLAN = "advisor_plan"
    PRICING_CALCULATION = "pricing_calculation"
    WORKLOAD_RECOMMENDATION = "workload_recommendation"


class RecommendationRequest(BaseModel):
    workload_type: WorkloadType
    region: str = Field(..., examples=["ap-south-1", "centralindia"])
    user_count: PositiveInt
    concurrent_users: PositiveInt
    storage_gb: PositiveInt
    monthly_requests_million: float = Field(default=1.0, ge=0.0)
    requires_disaster_recovery: bool = False
    requires_managed_database: bool = True
    availability_tier: AvailabilityTier = AvailabilityTier.HIGH
    budget_preference: BudgetPreference = BudgetPreference.BALANCED
    preferred_providers: list[CloudProvider] = Field(
        default_factory=lambda: [
            CloudProvider.AWS,
            CloudProvider.AZURE,
            CloudProvider.GCP,
            CloudProvider.ORACLE,
            CloudProvider.ALIBABA,
            CloudProvider.IBM,
            CloudProvider.TENCENT,
            CloudProvider.DIGITALOCEAN,
            CloudProvider.AKAMAI,
            CloudProvider.OVHCLOUD,
            CloudProvider.CLOUDFLARE,
        ]
    )


class ServiceEstimate(BaseModel):
    name: str
    purpose: str
    estimated_monthly_cost_usd: float


class ArchitectureRecommendation(BaseModel):
    provider: CloudProvider
    profile: str
    score: float
    estimated_monthly_cost_usd: float
    rationale: list[str]
    services: list[ServiceEstimate]


class RecommendationResponse(BaseModel):
    workload_type: WorkloadType
    baseline_inputs: RecommendationRequest
    recommendations: list[ArchitectureRecommendation]


class ProviderSummary(BaseModel):
    provider: CloudProvider
    strengths: list[str]
    default_regions: list[str]


class PricingDimension(BaseModel):
    key: str
    label: str
    unit: str
    rate_per_unit_usd: float = Field(ge=0.0)
    suggested_value: float = Field(default=0.0, ge=0.0)


class CatalogService(BaseModel):
    provider: CloudProvider
    category: ServiceCategory
    service_family: str
    service_code: str
    name: str
    summary: str
    default_region: str
    base_monthly_cost_usd: float = Field(ge=0.0)
    dimensions: list[PricingDimension] = Field(default_factory=list)


class ServiceComparisonGroup(BaseModel):
    service_family: str
    category: ServiceCategory
    label: str
    services: list[CatalogService]


class ServicePricingLineItemRequest(BaseModel):
    service_code: str
    region: str | None = None
    usage: dict[str, float] = Field(default_factory=dict)


class ServicePricingRequest(BaseModel):
    provider: CloudProvider
    items: list[ServicePricingLineItemRequest]


class CalculatedDimension(BaseModel):
    key: str
    label: str
    unit: str
    quantity: float
    rate_per_unit_usd: float
    estimated_monthly_cost_usd: float


class CalculatedLineItem(BaseModel):
    service_code: str
    service_name: str
    category: ServiceCategory
    region: str
    base_monthly_cost_usd: float
    dimensions: list[CalculatedDimension]
    estimated_monthly_cost_usd: float


class ServicePricingResponse(BaseModel):
    provider: CloudProvider
    items: list[CalculatedLineItem]
    estimated_monthly_cost_usd: float


class EstimationAdvisorRequest(BaseModel):
    requirement: str = Field(min_length=10)
    preferred_providers: list[CloudProvider] = Field(
        default_factory=lambda: [
            CloudProvider.AWS,
            CloudProvider.AZURE,
            CloudProvider.GCP,
            CloudProvider.ORACLE,
            CloudProvider.ALIBABA,
            CloudProvider.IBM,
            CloudProvider.TENCENT,
            CloudProvider.DIGITALOCEAN,
            CloudProvider.AKAMAI,
            CloudProvider.OVHCLOUD,
            CloudProvider.CLOUDFLARE,
        ]
    )
    monthly_budget_usd: float | None = Field(default=None, ge=0.0)


class AdvisorChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1)


class EstimationAdvisorChatRequest(BaseModel):
    messages: list[AdvisorChatMessage] = Field(min_length=1)
    preferred_providers: list[CloudProvider] = Field(
        default_factory=lambda: [
            CloudProvider.AWS,
            CloudProvider.AZURE,
            CloudProvider.GCP,
            CloudProvider.ORACLE,
            CloudProvider.ALIBABA,
            CloudProvider.IBM,
            CloudProvider.TENCENT,
            CloudProvider.DIGITALOCEAN,
            CloudProvider.AKAMAI,
            CloudProvider.OVHCLOUD,
            CloudProvider.CLOUDFLARE,
        ]
    )
    monthly_budget_usd: float | None = Field(default=None, ge=0.0)


class AdvisorSuggestion(BaseModel):
    provider: CloudProvider
    service_code: str
    service_name: str
    rationale: str


class AdvisorPlannedItem(BaseModel):
    service_code: str
    service_name: str
    region: str
    usage: dict[str, float] = Field(default_factory=dict)
    rationale: str


class AdvisorProviderPlan(BaseModel):
    provider: CloudProvider
    estimated_monthly_cost_usd: float
    items: list[AdvisorPlannedItem]


class EstimationAdvisorResponse(BaseModel):
    detected_workload: WorkloadType | None = None
    summary: str
    assumptions: list[str]
    estimation_steps: list[str]
    recommended_service_families: list[str]
    provider_suggestions: list[AdvisorSuggestion]
    provider_plans: list[AdvisorProviderPlan]
    recommended_provider: CloudProvider | None = None
    next_questions: list[str]


class EstimationAdvisorChatResponse(BaseModel):
    assistant_message: str
    conversation_summary: str
    needs_more_detail: bool = False
    inferred_request: RecommendationRequest | None = None
    estimate: EstimationAdvisorResponse | None = None
    recommendation: RecommendationResponse | None = None


class SavedEstimateCreate(BaseModel):
    name: str = Field(min_length=3)
    estimate_type: EstimateType
    provider: CloudProvider | None = None
    estimated_monthly_cost_usd: float | None = Field(default=None, ge=0.0)
    summary: str = Field(min_length=3)
    payload: dict[str, Any]


class SavedEstimateRecord(BaseModel):
    id: int
    name: str
    estimate_type: EstimateType
    provider: CloudProvider | None = None
    estimated_monthly_cost_usd: float | None = None
    summary: str
    payload: dict[str, Any]
    created_at: str


class AuthenticatedUser(BaseModel):
    id: int
    email: str
    full_name: str
    created_at: str


class AuthLoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=8)
    remember_me: bool = True


class AuthLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthenticatedUser


class CatalogImportRequest(BaseModel):
    snapshot_path: str


class CatalogImportResponse(BaseModel):
    status: str
    imported_services: int
    snapshot_path: str
