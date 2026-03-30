export type WorkloadType = "erp" | "application" | "crm";
export type AvailabilityTier = "standard" | "high" | "mission_critical";
export type BudgetPreference = "lowest_cost" | "balanced" | "enterprise";
export type CloudProvider =
  | "aws"
  | "azure"
  | "gcp"
  | "oracle"
  | "alibaba"
  | "ibm"
  | "tencent"
  | "digitalocean"
  | "akamai"
  | "ovhcloud"
  | "cloudflare";
export type ServiceCategory =
  | "compute"
  | "storage"
  | "database"
  | "networking"
  | "analytics"
  | "ai_ml"
  | "security";
export type EstimateType = "advisor_plan" | "pricing_calculation" | "workload_recommendation";

export interface AuthenticatedUser {
  id: number;
  email: string;
  full_name: string;
  created_at: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
  remember_me: boolean;
}

export interface AuthLoginResponse {
  access_token: string;
  token_type: "bearer";
  user: AuthenticatedUser;
}

export interface RecommendationRequest {
  workload_type: WorkloadType;
  region: string;
  user_count: number;
  concurrent_users: number;
  storage_gb: number;
  monthly_requests_million: number;
  requires_disaster_recovery: boolean;
  requires_managed_database: boolean;
  availability_tier: AvailabilityTier;
  budget_preference: BudgetPreference;
  preferred_providers: CloudProvider[];
}

export interface ServiceEstimate {
  name: string;
  purpose: string;
  estimated_monthly_cost_usd: number;
}

export interface ArchitectureRecommendation {
  provider: CloudProvider;
  profile: string;
  score: number;
  estimated_monthly_cost_usd: number;
  rationale: string[];
  services: ServiceEstimate[];
}

export interface RecommendationResponse {
  workload_type: WorkloadType;
  baseline_inputs: RecommendationRequest;
  recommendations: ArchitectureRecommendation[];
}

export interface ProviderSummary {
  provider: CloudProvider;
  strengths: string[];
  default_regions: string[];
}

export interface PricingDimension {
  key: string;
  label: string;
  unit: string;
  rate_per_unit_usd: number;
  suggested_value: number;
}

export interface CatalogService {
  provider: CloudProvider;
  category: ServiceCategory;
  service_family: string;
  service_code: string;
  name: string;
  summary: string;
  default_region: string;
  base_monthly_cost_usd: number;
  dimensions: PricingDimension[];
}

export interface ServiceComparisonGroup {
  service_family: string;
  category: ServiceCategory;
  label: string;
  services: CatalogService[];
}

export interface EstimationAdvisorRequest {
  requirement: string;
  preferred_providers: CloudProvider[];
  monthly_budget_usd?: number | null;
}

export interface AdvisorChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface EstimationAdvisorChatRequest {
  messages: AdvisorChatMessage[];
  preferred_providers: CloudProvider[];
  monthly_budget_usd?: number | null;
}

export interface AdvisorSuggestion {
  provider: CloudProvider;
  service_code: string;
  service_name: string;
  rationale: string;
}

export interface AdvisorPlannedItem {
  service_code: string;
  service_name: string;
  region: string;
  usage: Record<string, number>;
  rationale: string;
}

export interface AdvisorProviderPlan {
  provider: CloudProvider;
  estimated_monthly_cost_usd: number;
  items: AdvisorPlannedItem[];
}

export interface EstimationAdvisorResponse {
  detected_workload?: WorkloadType | null;
  summary: string;
  assumptions: string[];
  estimation_steps: string[];
  recommended_service_families: string[];
  provider_suggestions: AdvisorSuggestion[];
  provider_plans: AdvisorProviderPlan[];
  recommended_provider?: CloudProvider | null;
  next_questions: string[];
}

export interface EstimationAdvisorChatResponse {
  assistant_message: string;
  conversation_summary: string;
  needs_more_detail: boolean;
  inferred_request?: RecommendationRequest | null;
  estimate?: EstimationAdvisorResponse | null;
  recommendation?: RecommendationResponse | null;
}

export interface ServicePricingLineItemRequest {
  service_code: string;
  region?: string | null;
  usage: Record<string, number>;
}

export interface ServicePricingRequest {
  provider: CloudProvider;
  items: ServicePricingLineItemRequest[];
}

export interface CalculatedDimension {
  key: string;
  label: string;
  unit: string;
  quantity: number;
  rate_per_unit_usd: number;
  estimated_monthly_cost_usd: number;
}

export interface CalculatedLineItem {
  service_code: string;
  service_name: string;
  category: ServiceCategory;
  region: string;
  base_monthly_cost_usd: number;
  dimensions: CalculatedDimension[];
  estimated_monthly_cost_usd: number;
}

export interface ServicePricingResponse {
  provider: CloudProvider;
  items: CalculatedLineItem[];
  estimated_monthly_cost_usd: number;
}

export interface SavedEstimateCreate {
  name: string;
  estimate_type: EstimateType;
  provider?: CloudProvider | null;
  estimated_monthly_cost_usd?: number | null;
  summary: string;
  payload: Record<string, unknown>;
}

export interface SavedEstimateRecord {
  id: number;
  name: string;
  estimate_type: EstimateType;
  provider?: CloudProvider | null;
  estimated_monthly_cost_usd?: number | null;
  summary: string;
  payload: Record<string, unknown>;
  created_at: string;
}
