from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, PositiveInt


class WorkloadType(str, Enum):
    ERP = "erp"
    APPLICATION = "application"
    CRM = "crm"
    ECOMMERCE = "ecommerce"
    ANALYTICS = "analytics"
    AI_ML = "ai_ml"
    VDI = "vdi"
    DEV_TEST = "dev_test"
    WEB_API = "web_api"
    SAAS = "saas"


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
    SALESFORCE = "salesforce"
    SNOWFLAKE = "snowflake"


class ServiceCategory(str, Enum):
    COMPUTE = "compute"
    STORAGE = "storage"
    DATABASE = "database"
    NETWORKING = "networking"
    ANALYTICS = "analytics"
    AI_ML = "ai_ml"
    SECURITY = "security"
    SAAS = "saas"


class EstimateType(str, Enum):
    ADVISOR_PLAN = "advisor_plan"
    PRICING_CALCULATION = "pricing_calculation"
    WORKLOAD_RECOMMENDATION = "workload_recommendation"


class PricingSource(str, Enum):
    CATALOG_SNAPSHOT = "catalog_snapshot"
    LIVE_API = "live_api"
    BENCHMARK_LIVE = "benchmark_live"
    GENERATED = "generated"


class SelectiveServicePreference(BaseModel):
    service_family: str = Field(min_length=2)
    provider: CloudProvider
    region: str | None = None
    required: bool = True


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
    enable_decoupled_compute: bool = False
    selective_services: list[SelectiveServicePreference] = Field(default_factory=list)
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
            CloudProvider.SALESFORCE,
            CloudProvider.SNOWFLAKE,
        ]
    )


class ServiceEstimate(BaseModel):
    provider: CloudProvider | None = None
    service_code: str | None = None
    name: str
    purpose: str
    estimated_monthly_cost_usd: float
    pricing_source: PricingSource = PricingSource.CATALOG_SNAPSHOT
    last_validated_at: str | None = None
    verified_live_price: bool = False
    accuracy: "ServiceAccuracy | None" = None


class EstimateAccuracy(BaseModel):
    confidence_score: float = Field(ge=0.0, le=100.0)
    confidence_label: str
    compared_actuals_count: int = Field(default=0, ge=0)
    mean_absolute_percentage_error: float | None = Field(default=None, ge=0.0)
    median_absolute_percentage_error: float | None = Field(default=None, ge=0.0)
    live_pricing_coverage_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    pricing_sources: list[PricingSource] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class ServiceAccuracy(BaseModel):
    confidence_score: float = Field(ge=0.0, le=100.0)
    confidence_label: str
    compared_actuals_count: int = Field(default=0, ge=0)
    mean_absolute_percentage_error: float | None = Field(default=None, ge=0.0)
    pricing_source: PricingSource
    live_pricing_available: bool = False
    verified_live_price: bool = False
    caveats: list[str] = Field(default_factory=list)


class ArchitectureRecommendation(BaseModel):
    provider: CloudProvider
    profile: str
    score: float
    estimated_monthly_cost_usd: float
    rationale: list[str]
    services: list[ServiceEstimate]
    accuracy: EstimateAccuracy | None = None


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
    pricing_source: PricingSource = PricingSource.CATALOG_SNAPSHOT
    last_validated_at: str | None = None
    verified_live_price: bool = False


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
    pricing_source: PricingSource = PricingSource.CATALOG_SNAPSHOT
    last_validated_at: str | None = None
    verified_live_price: bool = False
    accuracy: ServiceAccuracy | None = None


class ServicePricingResponse(BaseModel):
    provider: CloudProvider
    items: list[CalculatedLineItem]
    estimated_monthly_cost_usd: float
    accuracy: EstimateAccuracy | None = None


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
            CloudProvider.SALESFORCE,
            CloudProvider.SNOWFLAKE,
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
            CloudProvider.SALESFORCE,
            CloudProvider.SNOWFLAKE,
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


class EstimateActualCreate(BaseModel):
    estimate_id: int | None = None
    provider: CloudProvider
    workload_type: WorkloadType | None = None
    service_code: str | None = None
    service_name: str | None = None
    region: str | None = None
    billing_period_start: str
    billing_period_end: str
    estimated_monthly_cost_usd: float | None = Field(default=None, ge=0.0)
    actual_monthly_cost_usd: float = Field(gt=0.0)
    notes: str = Field(default="", max_length=500)
    observed_usage: dict[str, float] = Field(default_factory=dict)


class EstimateActualRecord(BaseModel):
    id: int
    estimate_id: int | None = None
    provider: CloudProvider
    workload_type: WorkloadType | None = None
    service_code: str | None = None
    service_name: str | None = None
    region: str | None = None
    billing_period_start: str
    billing_period_end: str
    estimated_monthly_cost_usd: float | None = None
    actual_monthly_cost_usd: float
    notes: str
    observed_usage: dict[str, float]
    created_at: str


class LivePricingRefreshRequest(BaseModel):
    providers: list[CloudProvider] = Field(
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
            CloudProvider.SALESFORCE,
            CloudProvider.SNOWFLAKE,
        ]
    )


class LivePricingRefreshResult(BaseModel):
    provider: CloudProvider
    updated_services: int = Field(default=0, ge=0)
    verified_services: int = Field(default=0, ge=0)
    skipped_services: int = Field(default=0, ge=0)
    warnings: list[str] = Field(default_factory=list)


class LivePricingRefreshResponse(BaseModel):
    refreshed_at: str
    results: list[LivePricingRefreshResult]


class BillingImportRequest(BaseModel):
    snapshot_path: str
    provider: CloudProvider | None = None
    estimate_id: int | None = None
    workload_type: WorkloadType | None = None


class BillingImportResponse(BaseModel):
    snapshot_path: str
    imported_records: int = Field(ge=0)
    provider_counts: dict[str, int] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)


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


class ToonEncodeRequest(BaseModel):
    value: Any


class ToonEncodeResponse(BaseModel):
    toon: str


class ToonDecodeRequest(BaseModel):
    toon: str = Field(min_length=5)


class ToonDecodeResponse(BaseModel):
    value: Any


class DeploymentEnvironment(str, Enum):
    DEV = "dev"
    TEST = "test"
    STAGING = "staging"
    PROD = "prod"


class AccountStrategyAction(str, Enum):
    REUSE_EXISTING = "reuse_existing_account"
    CREATE_NEW = "create_new_account"


class AllocatorStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"
    NEEDS_APPROVAL = "needs_approval"


class ApprovedEstimationInput(BaseModel):
    approval_reference: str = Field(min_length=3)
    approved: bool = True
    baseline_request: RecommendationRequest
    recommended_provider: CloudProvider
    estimated_monthly_cost_usd: float | None = Field(default=None, ge=0.0)
    approved_services: list[ServiceEstimate] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class AllocatorBudgetConstraints(BaseModel):
    currency: str = Field(default="USD", min_length=3, max_length=8)
    max_monthly_cost: float = Field(gt=0.0)


class AllocatorOrganizationContext(BaseModel):
    allowed_clouds: list[CloudProvider] = Field(default_factory=lambda: [CloudProvider.AWS, CloudProvider.AZURE, CloudProvider.GCP])
    approved_account_ids: list[str] = Field(default_factory=list)
    billing_scope: str = Field(min_length=3)
    account_vending_enabled: bool = True
    default_parent_org_unit: str | None = None
    tagging_policy: list[str] = Field(default_factory=lambda: ["project", "env", "owner"])
    iam_boundary_name: str = Field(min_length=3)
    private_network_required: bool = True
    network_guardrails: list[str] = Field(default_factory=list)
    terraform_runner_enabled: bool = False
    terraform_artifact_root: str | None = None


class AllocatorDeploymentRequest(BaseModel):
    env: DeploymentEnvironment
    region: str = Field(min_length=2)
    owner: str = Field(min_length=2)
    project: str = Field(min_length=2)
    public_ingress_required: bool = False
    approval_to_apply: bool = False
    existing_account_id: str | None = None
    requires_new_account: bool = False
    account_name: str | None = None
    account_purpose: str | None = None
    parent_org_unit: str | None = None
    additional_tags: dict[str, str] = Field(default_factory=dict)


class ResourceAllocatorRequest(BaseModel):
    approved_estimation: ApprovedEstimationInput
    budget_constraints: AllocatorBudgetConstraints
    architecture_type: str = Field(min_length=2)
    organization_context: AllocatorOrganizationContext
    deployment_request: AllocatorDeploymentRequest


class AllocatorAccountDetails(BaseModel):
    account_id: str | None = None
    account_name: str | None = None
    parent_org_unit: str | None = None
    billing_scope: str | None = None


class AllocatorAccountStrategy(BaseModel):
    action: AccountStrategyAction
    reason: str
    target_cloud: CloudProvider
    account_details: AllocatorAccountDetails


class AllocatorPlannedService(BaseModel):
    provider: CloudProvider | None = None
    service_code: str | None = None
    service_name: str
    purpose: str
    category: str
    estimated_monthly_cost_usd: float = Field(ge=0.0)
    managed: bool = True
    public: bool = False


class AllocatorNetworkingPlan(BaseModel):
    region: str
    public_ingress: bool = False
    private_network: bool = True
    connectivity: list[str] = Field(default_factory=list)


class AllocatorIamPlan(BaseModel):
    boundary_name: str
    roles: list[str] = Field(default_factory=list)
    least_privilege: bool = True


class AllocatorInfrastructurePlan(BaseModel):
    architecture_type: str
    region: str
    services: list[AllocatorPlannedService] = Field(default_factory=list)
    networking: AllocatorNetworkingPlan
    iam: AllocatorIamPlan
    tags: dict[str, str] = Field(default_factory=dict)


class AllocatorTerraformFile(BaseModel):
    path: str
    content: str


class AllocatorTerraformBundle(BaseModel):
    generated: bool = False
    modules: list[str] = Field(default_factory=list)
    files: list[AllocatorTerraformFile] = Field(default_factory=list)


class AllocatorCostEstimate(BaseModel):
    currency: str
    estimated_monthly_cost: float = Field(ge=0.0)
    budget_limit: float = Field(ge=0.0)
    within_budget: bool


class AllocatorPolicyValidation(BaseModel):
    passed: bool
    violations: list[str] = Field(default_factory=list)


class AllocatorProvisioning(BaseModel):
    applied: bool = False
    approval_required: bool = True
    reason: str
    execution_mode: str = "bundle_only"
    artifact_path: str | None = None


class AllocatorToolRun(BaseModel):
    name: str
    status: Literal["completed", "skipped", "failed"]
    detail: str


class ResourceAllocatorResponse(BaseModel):
    status: AllocatorStatus
    summary: str
    account_strategy: AllocatorAccountStrategy
    infra_plan: AllocatorInfrastructurePlan | None = None
    terraform: AllocatorTerraformBundle
    cost_estimate: AllocatorCostEstimate
    policy_validation: AllocatorPolicyValidation
    provisioning: AllocatorProvisioning
    errors: list[str] = Field(default_factory=list)
    tool_runs: list[AllocatorToolRun] = Field(default_factory=list)


class CreateCloudAccountToolInput(BaseModel):
    target_cloud: CloudProvider
    account_name: str = Field(min_length=3)
    account_purpose: str = Field(min_length=3)
    parent_org_unit: str = Field(min_length=2)
    billing_scope: str = Field(min_length=3)
    project: str = Field(min_length=2)
    env: DeploymentEnvironment
    owner: str = Field(min_length=2)


class CreateCloudAccountToolOutput(BaseModel):
    account_id: str
    account_name: str
    parent_org_unit: str
    billing_scope: str
    status: str


class GenerateTerraformToolInput(BaseModel):
    provider: CloudProvider
    architecture_type: str = Field(min_length=2)
    infra_plan: AllocatorInfrastructurePlan


class GenerateTerraformToolOutput(BaseModel):
    modules: list[str] = Field(default_factory=list)
    files: list[AllocatorTerraformFile] = Field(default_factory=list)


class EstimateCostToolInput(BaseModel):
    provider: CloudProvider
    services: list[AllocatorPlannedService] = Field(default_factory=list)
    budget_constraints: AllocatorBudgetConstraints


class EstimateCostToolOutput(BaseModel):
    estimated_monthly_cost: float = Field(ge=0.0)
    within_budget: bool
    currency: str


class ValidatePolicyToolInput(BaseModel):
    account_strategy: AllocatorAccountStrategy
    infra_plan: AllocatorInfrastructurePlan
    cost_estimate: AllocatorCostEstimate
    organization_context: AllocatorOrganizationContext
    deployment_request: AllocatorDeploymentRequest


class ValidatePolicyToolOutput(BaseModel):
    passed: bool
    violations: list[str] = Field(default_factory=list)


class ApplyTerraformToolInput(BaseModel):
    terraform: AllocatorTerraformBundle
    provider: CloudProvider
    approval_to_apply: bool
    artifact_root: str | None = None


class ApplyTerraformToolOutput(BaseModel):
    applied: bool
    execution_mode: str
    artifact_path: str | None = None
    detail: str


class AllocatorToolContract(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]


class ResourceAllocatorContractResponse(BaseModel):
    system_prompt: str
    tool_contracts: list[AllocatorToolContract]
    output_schema: dict[str, Any]
