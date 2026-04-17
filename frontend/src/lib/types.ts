export type WorkloadType =
  | "erp"
  | "application"
  | "crm"
  | "ecommerce"
  | "analytics"
  | "ai_ml"
  | "vdi"
  | "dev_test"
  | "web_api"
  | "saas";
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
  | "cloudflare"
  | "salesforce"
  | "snowflake";
export type ServiceCategory =
  | "compute"
  | "storage"
  | "database"
  | "networking"
  | "analytics"
  | "ai_ml"
  | "security"
  | "saas";
export type EstimateType = "advisor_plan" | "pricing_calculation" | "workload_recommendation";
export type PricingSource = "catalog_snapshot" | "live_api" | "benchmark_live" | "generated";
export type DeploymentEnvironment = "dev" | "test" | "staging" | "prod";
export type AccountStrategyAction = "reuse_existing_account" | "create_new_account";
export type AllocatorStatus = "success" | "failed" | "needs_approval";

export interface AuthenticatedUser {
  id: number;
  email: string;
  full_name: string;
  created_at: string;
}

export type RoleName = "admin" | "architect" | "approver" | "finops" | "operator" | "viewer";
export type PermissionName =
  | "create_estimation"
  | "view_estimation"
  | "approve_request"
  | "reject_request"
  | "allocate_resources"
  | "view_cost"
  | "manage_users"
  | "view_logs";

export interface RbacPrincipal {
  sub: number;
  email: string;
  roles: RoleName[];
  permissions: PermissionName[];
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

export interface RbacPermissionRead {
  name: PermissionName;
  description: string;
}

export interface RbacRoleRead {
  name: RoleName;
  description: string;
  permissions: RbacPermissionRead[];
}

export interface RbacAuthenticatedUser {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: RbacRoleRead[];
}

export interface RbacLoginResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: RbacAuthenticatedUser;
}

export interface RbacUserCreateRequest {
  email: string;
  full_name: string;
  password: string;
  roles: RoleName[];
}

export interface RbacRoleAssignmentRequest {
  roles: RoleName[];
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
  enable_decoupled_compute?: boolean;
  selective_services?: SelectiveServicePreference[];
  preferred_providers: CloudProvider[];
}

export interface SelectiveServicePreference {
  service_family: string;
  provider: CloudProvider;
  region?: string | null;
  required?: boolean;
}

export interface ServiceEstimate {
  provider?: CloudProvider | null;
  service_code?: string | null;
  name: string;
  purpose: string;
  estimated_monthly_cost_usd: number;
  pricing_source: PricingSource;
  last_validated_at?: string | null;
  accuracy?: ServiceAccuracy | null;
}

export interface EstimateAccuracy {
  confidence_score: number;
  confidence_label: string;
  compared_actuals_count: number;
  mean_absolute_percentage_error?: number | null;
  median_absolute_percentage_error?: number | null;
  live_pricing_coverage_percent: number;
  pricing_sources: PricingSource[];
  caveats: string[];
}

export interface ServiceAccuracy {
  confidence_score: number;
  confidence_label: string;
  compared_actuals_count: number;
  mean_absolute_percentage_error?: number | null;
  pricing_source: PricingSource;
  live_pricing_available: boolean;
  caveats: string[];
}

export interface ArchitectureRecommendation {
  provider: CloudProvider;
  profile: string;
  score: number;
  estimated_monthly_cost_usd: number;
  rationale: string[];
  services: ServiceEstimate[];
  accuracy?: EstimateAccuracy | null;
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
  pricing_source: PricingSource;
  last_validated_at?: string | null;
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
  pricing_source: PricingSource;
  last_validated_at?: string | null;
  accuracy?: ServiceAccuracy | null;
}

export interface ServicePricingResponse {
  provider: CloudProvider;
  items: CalculatedLineItem[];
  estimated_monthly_cost_usd: number;
  accuracy?: EstimateAccuracy | null;
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

export interface EstimateActualCreate {
  estimate_id?: number | null;
  provider: CloudProvider;
  workload_type?: WorkloadType | null;
  service_code?: string | null;
  service_name?: string | null;
  region?: string | null;
  billing_period_start: string;
  billing_period_end: string;
  estimated_monthly_cost_usd?: number | null;
  actual_monthly_cost_usd: number;
  notes?: string;
  observed_usage: Record<string, number>;
}

export interface EstimateActualRecord {
  id: number;
  estimate_id?: number | null;
  provider: CloudProvider;
  workload_type?: WorkloadType | null;
  service_code?: string | null;
  service_name?: string | null;
  region?: string | null;
  billing_period_start: string;
  billing_period_end: string;
  estimated_monthly_cost_usd?: number | null;
  actual_monthly_cost_usd: number;
  notes: string;
  observed_usage: Record<string, number>;
  created_at: string;
}

export interface LivePricingRefreshRequest {
  providers: CloudProvider[];
}

export interface LivePricingRefreshResult {
  provider: CloudProvider;
  updated_services: number;
  skipped_services: number;
  warnings: string[];
}

export interface LivePricingRefreshResponse {
  refreshed_at: string;
  results: LivePricingRefreshResult[];
}

export interface BillingImportRequest {
  snapshot_path: string;
  provider?: CloudProvider | null;
  estimate_id?: number | null;
  workload_type?: WorkloadType | null;
}

export interface BillingImportResponse {
  snapshot_path: string;
  imported_records: number;
  provider_counts: Record<string, number>;
  warnings: string[];
}

export interface ApprovedEstimationInput {
  approval_reference: string;
  approved: boolean;
  baseline_request: RecommendationRequest;
  recommended_provider: CloudProvider;
  estimated_monthly_cost_usd?: number | null;
  approved_services: ServiceEstimate[];
  notes: string[];
}

export interface AllocatorBudgetConstraints {
  currency: string;
  max_monthly_cost: number;
}

export interface AllocatorOrganizationContext {
  allowed_clouds: CloudProvider[];
  approved_account_ids: string[];
  billing_scope: string;
  account_vending_enabled: boolean;
  default_parent_org_unit?: string | null;
  tagging_policy: string[];
  iam_boundary_name: string;
  private_network_required: boolean;
  network_guardrails: string[];
  terraform_runner_enabled: boolean;
  terraform_artifact_root?: string | null;
}

export interface AllocatorDeploymentRequest {
  env: DeploymentEnvironment;
  region: string;
  owner: string;
  project: string;
  public_ingress_required: boolean;
  approval_to_apply: boolean;
  existing_account_id?: string | null;
  requires_new_account: boolean;
  account_name?: string | null;
  account_purpose?: string | null;
  parent_org_unit?: string | null;
  additional_tags: Record<string, string>;
}

export interface ResourceAllocatorRequest {
  approved_estimation: ApprovedEstimationInput;
  budget_constraints: AllocatorBudgetConstraints;
  architecture_type: string;
  organization_context: AllocatorOrganizationContext;
  deployment_request: AllocatorDeploymentRequest;
}

export interface AllocatorAccountDetails {
  account_id?: string | null;
  account_name?: string | null;
  parent_org_unit?: string | null;
  billing_scope?: string | null;
}

export interface AllocatorAccountStrategy {
  action: AccountStrategyAction;
  reason: string;
  target_cloud: CloudProvider;
  account_details: AllocatorAccountDetails;
}

export interface AllocatorPlannedService {
  provider?: CloudProvider | null;
  service_code?: string | null;
  service_name: string;
  purpose: string;
  category: string;
  estimated_monthly_cost_usd: number;
  managed: boolean;
  public: boolean;
}

export interface AllocatorNetworkingPlan {
  region: string;
  public_ingress: boolean;
  private_network: boolean;
  connectivity: string[];
}

export interface AllocatorIamPlan {
  boundary_name: string;
  roles: string[];
  least_privilege: boolean;
}

export interface AllocatorInfrastructurePlan {
  architecture_type: string;
  region: string;
  services: AllocatorPlannedService[];
  networking: AllocatorNetworkingPlan;
  iam: AllocatorIamPlan;
  tags: Record<string, string>;
}

export interface AllocatorTerraformFile {
  path: string;
  content: string;
}

export interface AllocatorTerraformBundle {
  generated: boolean;
  modules: string[];
  files: AllocatorTerraformFile[];
}

export interface AllocatorCostEstimate {
  currency: string;
  estimated_monthly_cost: number;
  budget_limit: number;
  within_budget: boolean;
}

export interface AllocatorPolicyValidation {
  passed: boolean;
  violations: string[];
}

export interface AllocatorProvisioning {
  applied: boolean;
  approval_required: boolean;
  reason: string;
  execution_mode: string;
  artifact_path?: string | null;
}

export interface AllocatorToolRun {
  name: string;
  status: "completed" | "skipped" | "failed";
  detail: string;
}

export interface ResourceAllocatorResponse {
  status: AllocatorStatus;
  summary: string;
  account_strategy: AllocatorAccountStrategy;
  infra_plan?: AllocatorInfrastructurePlan | null;
  terraform: AllocatorTerraformBundle;
  cost_estimate: AllocatorCostEstimate;
  policy_validation: AllocatorPolicyValidation;
  provisioning: AllocatorProvisioning;
  errors: string[];
  tool_runs: AllocatorToolRun[];
}

export interface AllocatorToolContract {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

export interface ResourceAllocatorContractResponse {
  system_prompt: string;
  tool_contracts: AllocatorToolContract[];
  output_schema: Record<string, unknown>;
}

export type AllocatorRunStatus =
  | "draft"
  | "validated"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "provisioning"
  | "completed"
  | "failed";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type BudgetValidationStatus = "pending" | "approved" | "rejected";

export interface AllocatorRunCreateRequest {
  requested_by: string;
  change_reason: string;
  payload: ResourceAllocatorRequest;
}

export interface ApprovalActionRequest {
  reviewer: string;
  comment: string;
}

export interface BudgetValidationActionRequest {
  reviewer: string;
  comment: string;
}

export interface AllocationActionRequest {
  operator: string;
  comment: string;
}

export interface CloudAccountPlan {
  provider: CloudProvider;
  reuse_existing: boolean;
  resource_kind: string;
  account_name: string;
  organizational_unit: string;
  billing_scope?: string | null;
  account_email?: string | null;
  existing_account_id?: string | null;
  target_account_id?: string | null;
  target_account_arn?: string | null;
  provisioning_reference?: string | null;
  rationale: string;
}

export interface WorkflowValidationResult {
  passed: boolean;
  violations: string[];
}

export interface WorkflowCostResult {
  currency: string;
  estimated_monthly_cost: number;
  within_budget: boolean;
  line_items: Array<Record<string, unknown>>;
}

export interface ProvisioningResult {
  applied: boolean;
  account_created: boolean;
  terraform_artifact_path?: string | null;
  execution_reference?: string | null;
  message: string;
}

export interface ToolExecutionSnapshot {
  name: string;
  status: string;
  message: string;
}

export interface AllocatorRunRecord {
  id: number;
  requested_by: string;
  change_reason: string;
  status: AllocatorRunStatus;
  approval_status: ApprovalStatus;
  budget_validation_status: BudgetValidationStatus;
  summary: string;
  payload: ResourceAllocatorRequest;
  account_plan?: CloudAccountPlan | null;
  terraform_bundle?: AllocatorTerraformBundle | null;
  cost_result?: WorkflowCostResult | null;
  policy_result?: WorkflowValidationResult | null;
  provisioning_result?: ProvisioningResult | null;
  workflow_trace: string[];
  error_message?: string | null;
  created_at: string;
  updated_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_comment?: string | null;
  budget_validated_by?: string | null;
  budget_validated_at?: string | null;
  budget_validation_comment?: string | null;
}

export interface AllocatorRunResponse {
  run: AllocatorRunRecord;
  tools: ToolExecutionSnapshot[];
}

export interface AllocatorRunListResponse {
  runs: AllocatorRunRecord[];
}

export interface PendingApprovalRecord {
  run_id: number;
  requested_by: string;
  summary: string;
  created_at: string;
  approval_status: ApprovalStatus;
}

export interface PendingApprovalListResponse {
  approvals: PendingApprovalRecord[];
}

export interface AuditLogRecord {
  id: number;
  run_id?: number | null;
  actor: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogListResponse {
  logs: AuditLogRecord[];
}

export type NoodleDeploymentScope = "hybrid" | "multi_cloud" | "edge" | "hybrid_multi_cloud";
export type NoodleSourceKind = "api" | "database" | "stream" | "file" | "iot" | "saas" | "github";
export type NoodleSourceEnvironment = "on_prem" | "aws" | "azure" | "gcp" | "edge" | "saas";
export type NoodleChangePattern = "append" | "cdc" | "event" | "snapshot";
export type NoodleProcessingMode = "batch" | "stream" | "micro_batch" | "hybrid";
export type NoodleTargetZone = "bronze" | "silver" | "gold" | "feature_store" | "serving";
export type NoodleLatencySlo = "seconds" | "minutes" | "hours" | "daily";

export interface NoodleSourceSystem {
  name: string;
  kind: NoodleSourceKind;
  environment: NoodleSourceEnvironment;
  format_hint: string;
  change_pattern: NoodleChangePattern;
}

export interface NoodlePipelineIntent {
  name: string;
  business_goal: string;
  deployment_scope: NoodleDeploymentScope;
  latency_slo: NoodleLatencySlo;
  requires_ml_features: boolean;
  requires_realtime_serving: boolean;
  contains_sensitive_data: boolean;
  target_consumers: string[];
  sources: NoodleSourceSystem[];
}

export interface NoodleConnectorPlan {
  source_name: string;
  connector_type: string;
  ingestion_mode: NoodleProcessingMode;
  landing_topic: string;
  landing_zone: NoodleTargetZone;
  notes: string[];
}

export interface NoodleProcessingStage {
  name: string;
  engine: string;
  mode: NoodleProcessingMode;
  purpose: string;
  outputs: NoodleTargetZone[];
}

export interface NoodleGovernanceControl {
  name: string;
  category: "access" | "privacy" | "compliance" | "quality" | "residency";
  enforcement_point: string;
  rationale: string;
}

export interface NoodleAiCapability {
  name: string;
  function: string;
  activation_rule: string;
}

export interface NoodleObservabilityCapability {
  name: string;
  metric_family: string;
  sink: string;
}

export interface NoodleTechnologyMapping {
  layer: string;
  primary: string[];
  optional: string[];
}

export interface NoodleUseCase {
  name: string;
  summary: string;
  involved_layers: string[];
}

export interface NoodleScalabilityConcern {
  concern: string;
  strategy: string;
}

export interface NoodleArchitecturePrinciple {
  title: string;
  directive: string;
  rationale: string;
}

export interface NoodlePlatformPlane {
  name: string;
  responsibility: string;
  components: string[];
}

export interface NoodleRepositorySection {
  root: string;
  paths: string[];
}

export interface NoodleRecommendedStackItem {
  layer: string;
  technologies: string[];
}

export interface NoodleBuildPhase {
  phase: string;
  outcomes: string[];
}

export interface NoodleExecutionFlowStep {
  step: string;
  description: string;
}

export interface NoodleTaskState {
  name: string;
  description: string;
}

export interface NoodleExecutionEngineBlueprint {
  summary: string;
  flow: NoodleExecutionFlowStep[];
  task_states: NoodleTaskState[];
}

export interface NoodleSavedArchitectureContext {
  name: string;
  prompt: string;
  selected_providers: string[];
  diagram_style?: string | null;
  summary: string;
  assumptions: string[];
  components: string[];
  cloud_services: string[];
  data_flow: string[];
  scaling_strategy: string[];
  security_considerations: string[];
  saved_at?: string | null;
}

export interface NoodleArchitectureAlignmentItem {
  area: string;
  guidance: string;
}

export type NoodleTaskExecutionPlane =
  | "control_plane"
  | "airflow"
  | "worker"
  | "quality"
  | "serving";

export interface NoodleOrchestratorTaskPlan {
  id: string;
  node_id?: string | null;
  name: string;
  stage: string;
  plugin: string;
  execution_plane: NoodleTaskExecutionPlane;
  depends_on: string[];
  outputs: string[];
  notes: string;
}

export interface NoodleOrchestratorPlan {
  id: string;
  name: string;
  objective: string;
  trigger: "manual" | "schedule" | "event" | "if";
  execution_target: string;
  tasks: NoodleOrchestratorTaskPlan[];
  notes: string[];
}

export interface NoodlePipelinePlanningRequest {
  intent: NoodlePipelineIntent;
  architecture_context?: NoodleSavedArchitectureContext | null;
  architecture_overview?: NoodleArchitectureOverview | null;
  practice_principles?: NoodleArchitecturePrinciple[];
}

export interface NoodlePipelinePlanResponse {
  intent: NoodlePipelineIntent;
  connectors: NoodleConnectorPlan[];
  processing_stages: NoodleProcessingStage[];
  governance_controls: NoodleGovernanceControl[];
  ai_capabilities: NoodleAiCapability[];
  observability: NoodleObservabilityCapability[];
  serving_patterns: string[];
  workflow_template: string;
  architecture_context_name?: string | null;
  practice_principles_applied: string[];
  architecture_alignment: NoodleArchitectureAlignmentItem[];
  agent_momo_brief: string;
  orchestrator_plan: NoodleOrchestratorPlan;
}

export interface NoodleReferenceSpec {
  id: string;
  name: string;
  summary: string;
  tags: string[];
  sample_intent: NoodlePipelineIntent;
}

export interface NoodleArchitectureOverview {
  name: string;
  objective: string;
  textual_diagram: string;
  core_capabilities: string[];
  component_breakdown: Record<string, string[]>;
  technology_mapping: NoodleTechnologyMapping[];
  use_cases: NoodleUseCase[];
  scalability: NoodleScalabilityConcern[];
}

export interface NoodlePlatformBlueprint {
  overview: NoodleArchitectureOverview;
  lakehouse_layout: Record<string, string[]>;
  orchestration_stack: string[];
  metadata_stack: string[];
  governance_stack: string[];
  ai_stack: string[];
  observability_stack: string[];
  design_principles: NoodleArchitecturePrinciple[];
  platform_planes: NoodlePlatformPlane[];
  repository_layout: NoodleRepositorySection[];
  recommended_stack: NoodleRecommendedStackItem[];
  build_phases: NoodleBuildPhase[];
  execution_engine: NoodleExecutionEngineBlueprint;
}

export type NoodleDesignerNodeKind =
  | "source"
  | "ingest"
  | "transform"
  | "cache"
  | "quality"
  | "feature"
  | "serve";

export interface NoodleDesignerParam {
  key: string;
  value: string;
}

export interface NoodleDesignerNode {
  id: string;
  label: string;
  kind: NoodleDesignerNodeKind;
  position: {
    x: number;
    y: number;
  };
  params: NoodleDesignerParam[];
}

export interface NoodleDesignerEdge {
  id: string;
  source: string;
  target: string;
}

export type NoodleDesignerDocumentStatus = "draft" | "published";
export type NoodleDesignerValidationLevel = "error" | "warning";
export type NoodleDesignerDeploymentProvider = "github" | "gitlab" | "bitbucket" | "custom";
export type NoodleDesignerDeploymentTarget =
  | "local_docker"
  | "kubernetes"
  | "airflow_worker"
  | "worker_runtime"
  | "custom";

export interface NoodleDesignerValidation {
  id: string;
  level: NoodleDesignerValidationLevel;
  message: string;
}

export interface NoodlePipelineDesignerDocument {
  id: string;
  name: string;
  status: NoodleDesignerDocumentStatus;
  version: number;
  nodes: NoodleDesignerNode[];
  edges: NoodleDesignerEdge[];
  connection_refs: NoodleDesignerConnectionRef[];
  metadata_assets: NoodleDesignerMetadataAsset[];
  schemas: NoodleDesignerSchema[];
  transformations: NoodleDesignerTransformation[];
  deployment: NoodleDesignerDeployment;
  orchestrator_plan: NoodleOrchestratorPlan;
  schedule: NoodleDesignerSchedule;
  batch_sessions?: NoodleDesignerBatchSession[];
  runs: NoodleDesignerRun[];
  saved_at: string;
}

export interface NoodleDesignerConnectionRef {
  id: string;
  name: string;
  plugin: string;
  environment: string;
  auth_ref: string;
  params: NoodleDesignerParam[];
  notes: string;
}

export interface NoodleDesignerCodeRepository {
  provider: NoodleDesignerDeploymentProvider;
  connection_id?: string | null;
  repository: string;
  branch: string;
  backend_path: string;
  workflow_ref: string;
}

export interface NoodleDesignerDeployment {
  enabled: boolean;
  deploy_target: NoodleDesignerDeploymentTarget;
  repository: NoodleDesignerCodeRepository;
  build_command: string;
  deploy_command: string;
  artifact_name: string;
  notes: string;
}

export interface NoodleDesignerMetadataAsset {
  id: string;
  name: string;
  zone: NoodleTargetZone | "control_plane";
  owner: string;
  classification: string;
  tags: string[];
}

export interface NoodleDesignerSchemaField {
  id: string;
  name: string;
  type: string;
  nullable: boolean;
  description: string;
}

export interface NoodleDesignerSchema {
  id: string;
  name: string;
  source_connection_id?: string | null;
  fields: NoodleDesignerSchemaField[];
}

export type NoodleDesignerTransformationMode = "python" | "sql" | "dbt" | "spark_sql" | "custom";

export interface NoodleDesignerTransformation {
  id: string;
  node_id?: string | null;
  name: string;
  plugin: string;
  mode: NoodleDesignerTransformationMode;
  description: string;
  code: string;
  config_json: string;
  tags: string[];
}

export interface NoodleDesignerSchedule {
  trigger: "manual" | "schedule" | "event" | "if";
  cron: string;
  timezone: string;
  enabled: boolean;
  concurrency_policy: "allow" | "forbid" | "replace";
  orchestration_mode: "tasks" | "plan";
  if_condition: string;
}

export type NoodleDesignerRunStatus = "queued" | "running" | "success" | "failed" | "cancelled";
export type NoodleDesignerTaskRunState =
  | "pending"
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "retrying"
  | "skipped"
  | "cancelled"
  | "reused";
export type NoodleDesignerLogLevel = "log" | "info" | "warn";
export type NoodleDesignerRepairScope = "failed" | "failed_and_dependents" | "selected" | "selected_and_dependents";
export type NoodleDesignerRepairMode = "exact" | "best_effort";
export type NoodleDesignerRepairOutcome = "exact" | "best_effort" | "blocked";
export type NoodleDesignerSinkSupportLevel = "exact" | "best_effort" | "unsafe";
export type NoodleDesignerBatchSessionStatus = "staging" | "partial" | "publishing" | "committed" | "failed" | "blocked";

export interface NoodleDesignerRunTask {
  id: string;
  node_id: string;
  node_label: string;
  state: NoodleDesignerTaskRunState;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface NoodleDesignerRunLog {
  id: string;
  timestamp: string;
  level: NoodleDesignerLogLevel;
  message: string;
  node_id?: string | null;
}

export interface NoodleDesignerCachedOutput {
  id: string;
  node_id: string;
  node_label: string;
  source_node_id?: string | null;
  source_node_label?: string | null;
  format: "jsonl" | "json" | "csv" | "text";
  content_type: string;
  summary: string;
  preview_text: string;
  preview_bytes: number;
  captured_bytes: number;
  max_capture_bytes: number;
  truncated: boolean;
  approx_records: number;
}

export interface NoodleDesignerRepairIssue {
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
  task_id?: string | null;
}

export interface NoodleDesignerSinkBinding {
  task_id: string;
  task_label: string;
  sink_node_id: string;
  sink_node_label: string;
  sink_plugin: string;
  support_level: NoodleDesignerSinkSupportLevel;
  idempotency_strategy: string;
  transaction_strategy: string;
  output_asset_id: string;
  output_version?: string | null;
  idempotency_key?: string | null;
  notes: string;
}

export interface NoodleDesignerLineageRecord {
  task_id: string;
  task_label: string;
  input_assets: string[];
  output_assets: string[];
  output_version?: string | null;
}

export interface NoodleDesignerRepairPlan {
  attempt_id: string;
  base_run_id: string;
  root_run_id: string;
  document_version: number;
  mode: NoodleDesignerRepairMode;
  outcome: NoodleDesignerRepairOutcome;
  scope: NoodleDesignerRepairScope;
  rerun_task_ids: string[];
  reused_task_ids: string[];
  downstream_task_ids: string[];
  validation_issues: NoodleDesignerRepairIssue[];
}

export interface NoodleDesignerBatchResumeToken {
  source_system: string;
  source_batch_id: string;
  expected_count: number;
  next_offset: number;
  ordering_key: string;
  schema_fingerprint: string;
  payload_fingerprint_mode: string;
  last_committed_at?: string | null;
}

export interface NoodleDesignerBatchSessionAttempt {
  id: string;
  run_id: string;
  kind: "run" | "resume";
  mode: NoodleDesignerRepairMode;
  status: NoodleDesignerBatchSessionStatus;
  from_offset: number;
  started_at: string;
  finished_at?: string | null;
  staged_count: number;
  next_offset: number;
  committed_version?: string | null;
  reason?: string | null;
}

export interface NoodleDesignerBatchSession {
  id: string;
  source_node_id: string;
  source_node_label: string;
  source_system: string;
  source_batch_id: string;
  expected_count: number;
  staged_count: number;
  committed_count: number;
  next_offset: number;
  max_contiguous_committed_offset: number;
  status: NoodleDesignerBatchSessionStatus;
  resume_token: NoodleDesignerBatchResumeToken;
  exact_supported: boolean;
  exact_support_summary: string;
  schema_fingerprint: string;
  last_run_id?: string | null;
  root_run_id?: string | null;
  committed_version?: string | null;
  related_run_ids: string[];
  attempts: NoodleDesignerBatchSessionAttempt[];
}

export interface NoodleDesignerRun {
  id: string;
  label: string;
  orchestrator: string;
  status: NoodleDesignerRunStatus;
  trigger: "manual" | "schedule" | "event" | "if";
  orchestration_mode: "tasks" | "plan";
  started_at: string;
  finished_at?: string | null;
  document_version?: number | null;
  root_run_id?: string | null;
  repair_of_run_id?: string | null;
  repair_attempt?: number | null;
  repair_attempt_id?: string | null;
  repair_scope?: NoodleDesignerRepairScope | null;
  repair_mode?: NoodleDesignerRepairMode | null;
  repair_outcome?: NoodleDesignerRepairOutcome | null;
  repair_reason?: string | null;
  repaired_task_ids?: string[];
  reused_task_ids?: string[];
  repair_plan?: NoodleDesignerRepairPlan | null;
  batch_session_ids?: string[];
  task_runs: NoodleDesignerRunTask[];
  logs: NoodleDesignerRunLog[];
  cached_outputs: NoodleDesignerCachedOutput[];
  sink_bindings?: NoodleDesignerSinkBinding[];
  lineage_records?: NoodleDesignerLineageRecord[];
}

export interface NoodlePipelineRunCreateRequest {
  trigger: "manual" | "schedule" | "event" | "if";
  orchestration_mode: "tasks" | "plan";
  if_condition?: string | null;
  test_node_id?: string | null;
  document?: NoodlePipelineDesignerDocument | null;
}

export interface NoodlePipelineRepairRunRequest {
  repair_scope: NoodleDesignerRepairScope;
  repair_mode: NoodleDesignerRepairMode;
  task_ids: string[];
  reason?: string;
  orchestration_mode?: "tasks" | "plan" | null;
  document?: NoodlePipelineDesignerDocument | null;
}

export interface NoodlePipelineBatchResumeRequest {
  mode: NoodleDesignerRepairMode;
  from_offset?: number | null;
  reason?: string;
  dry_run?: boolean;
  document?: NoodlePipelineDesignerDocument | null;
}

export interface NoodlePipelineRunResponse {
  pipeline: NoodlePipelineDesignerDocument;
  run: NoodleDesignerRun;
}

export interface NoodlePipelineBatchResumeResponse {
  pipeline: NoodlePipelineDesignerDocument;
  batch_session: NoodleDesignerBatchSession;
  run: NoodleDesignerRun;
}

export type NoodleSchedulerExecutionProfile = "batch" | "streaming" | "one_time_ingestion";

export interface NoodleSchedulerPlanTask {
  id: string;
  task_name: string;
  pipeline_id: string;
  pipeline_name: string;
  trigger: NoodlePipelineRunCreateRequest["trigger"];
  orchestration_mode: NoodlePipelineRunCreateRequest["orchestration_mode"];
  execution_profile?: NoodleSchedulerExecutionProfile | null;
  depends_on: string[];
  notes: string;
  canvas_position?: {
    x: number;
    y: number;
  } | null;
  last_run_id?: string | null;
  last_status?: NoodleDesignerRunStatus | null;
}

export interface NoodleSchedulerPlan {
  id: string;
  name: string;
  objective: string;
  tasks: NoodleSchedulerPlanTask[];
  saved_at: string;
}

export interface PendingNoodleSchedulerSession {
  source: "orchestrator" | "designer";
  intent_name?: string | null;
  orchestrator_plan?: NoodleOrchestratorPlan | null;
  document?: NoodlePipelineDesignerDocument | null;
  opened_at: string;
}
