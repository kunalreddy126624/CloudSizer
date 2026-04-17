import type {
  AllocationActionRequest,
  AllocatorRunCreateRequest,
  AllocatorRunListResponse,
  AllocatorRunRecord,
  AllocatorRunResponse,
  ApprovalActionRequest,
  AuditLogListResponse,
  AuthLoginRequest,
  AuthLoginResponse,
  AuthenticatedUser,
  BillingImportRequest,
  BillingImportResponse,
  CatalogService,
  EstimateActualCreate,
  EstimateActualRecord,
  EstimationAdvisorChatRequest,
  EstimationAdvisorChatResponse,
  EstimationAdvisorRequest,
  EstimationAdvisorResponse,
  LivePricingRefreshRequest,
  LivePricingRefreshResponse,
  NoodleArchitectureOverview,
  NoodlePipelineBatchResumeRequest,
  NoodlePipelineBatchResumeResponse,
  NoodlePipelineDesignerDocument,
  NoodlePipelineIntent,
  NoodlePipelinePlanningRequest,
  NoodlePipelinePlanResponse,
  NoodlePlatformBlueprint,
  NoodlePipelineRepairRunRequest,
  NoodlePipelineRunCreateRequest,
  NoodlePipelineRunResponse,
  NoodleReferenceSpec,
  PendingApprovalListResponse,
  ProviderSummary,
  RbacAuthenticatedUser,
  RbacLoginResponse,
  RbacRoleAssignmentRequest,
  RbacPrincipal,
  RbacUserCreateRequest,
  RecommendationRequest,
  RecommendationResponse,
  ResourceAllocatorContractResponse,
  ResourceAllocatorRequest,
  ResourceAllocatorResponse,
  SavedEstimateCreate,
  SavedEstimateRecord,
  ServiceCategory,
  ServiceComparisonGroup,
  ServicePricingRequest,
  ServicePricingResponse,
  BudgetValidationActionRequest
} from "@/lib/types";

const API_BASE_URL = "/api";
const LOCAL_TOKEN_KEY = "cloudsizer.auth_token";
const SESSION_TOKEN_KEY = "cloudsizer.auth_token_session";

function getStoredToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(LOCAL_TOKEN_KEY) ?? window.sessionStorage.getItem(SESSION_TOKEN_KEY);
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const token = getStoredToken();

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });
  } catch {
    throw new Error("Could not reach the local frontend API proxy. Make sure the Next.js app is running.");
  }

  if (!response.ok) {
    let message = `API request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") {
        message = body.detail;
      } else if (Array.isArray(body.detail) && body.detail.length > 0) {
        const firstIssue = body.detail[0] as { loc?: string[]; msg?: string };
        const field = firstIssue.loc?.slice(1).join(".") ?? "request";
        message = `${field}: ${firstIssue.msg ?? "Invalid value"}`;
      }
    } catch {
      // Fall back to the generic HTTP status message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function getProviders() {
  return apiRequest<ProviderSummary[]>("/providers");
}

export function getNoodleOverview() {
  return apiRequest<NoodleArchitectureOverview>("/noodle/overview");
}

export function getNoodleBlueprint() {
  return apiRequest<NoodlePlatformBlueprint>("/noodle/blueprint");
}

export function listNoodleReferenceSpecs() {
  return apiRequest<NoodleReferenceSpec[]>("/noodle/reference-specs");
}

export function planNoodlePipeline(request: NoodlePipelinePlanningRequest) {
  return apiRequest<NoodlePipelinePlanResponse>("/noodle/pipelines/plan", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function listNoodlePipelines() {
  return apiRequest<NoodlePipelineDesignerDocument[]>("/noodle/pipelines");
}

export function getNoodlePipeline(pipelineId: string) {
  return apiRequest<NoodlePipelineDesignerDocument>(`/noodle/pipelines/${pipelineId}`);
}

export function saveNoodlePipeline(request: NoodlePipelineDesignerDocument) {
  return apiRequest<NoodlePipelineDesignerDocument>("/noodle/pipelines", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function createNoodlePipelineRun(pipelineId: string, request: NoodlePipelineRunCreateRequest) {
  return apiRequest<NoodlePipelineRunResponse>(`/noodle/pipelines/${pipelineId}/runs`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function createNoodlePipelineRepairRun(
  pipelineId: string,
  runId: string,
  request: NoodlePipelineRepairRunRequest
) {
  return apiRequest<NoodlePipelineRunResponse>(`/noodle/pipelines/${pipelineId}/runs/${runId}/repair`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function resumeNoodlePipelineBatchSession(
  pipelineId: string,
  batchSessionId: string,
  request: NoodlePipelineBatchResumeRequest
) {
  return apiRequest<NoodlePipelineBatchResumeResponse>(`/noodle/pipelines/${pipelineId}/batch-sessions/${batchSessionId}/resume`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function loginUser(request: AuthLoginRequest) {
  return apiRequest<AuthLoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function loginRbacUser(request: AuthLoginRequest) {
  return apiRequest<RbacLoginResponse>("/rbac/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: request.email,
      password: request.password
    })
  });
}

export function getCurrentUser() {
  return apiRequest<AuthenticatedUser>("/auth/me");
}

export function getRbacPrincipal() {
  return apiRequest<RbacPrincipal>("/rbac/auth/me");
}

export function listRbacUsers() {
  return apiRequest<RbacAuthenticatedUser[]>("/rbac/users");
}

export function createRbacUser(request: RbacUserCreateRequest) {
  return apiRequest<RbacAuthenticatedUser>("/rbac/users", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function assignRbacUserRoles(userId: number, request: RbacRoleAssignmentRequest) {
  return apiRequest<RbacAuthenticatedUser>(`/rbac/users/${userId}/roles`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function logoutUser() {
  return apiRequest<{ status: string }>("/auth/logout", {
    method: "POST"
  });
}

export function getRecommendations(request: RecommendationRequest) {
  return apiRequest<RecommendationResponse>("/recommendations", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function getCatalogServices(provider?: string, category?: ServiceCategory) {
  const params = new URLSearchParams();
  if (provider) {
    params.set("provider", provider);
  }
  if (category) {
    params.set("category", category);
  }

  const query = params.toString();
  return apiRequest<CatalogService[]>(`/catalog/services${query ? `?${query}` : ""}`);
}

export function getServiceComparisons(category?: ServiceCategory) {
  const params = new URLSearchParams();
  if (category) {
    params.set("category", category);
  }

  const query = params.toString();
  return apiRequest<ServiceComparisonGroup[]>(`/catalog/comparisons${query ? `?${query}` : ""}`);
}

export function calculateServicePricing(request: ServicePricingRequest) {
  return apiRequest<ServicePricingResponse>("/pricing/calculate", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function estimatePlan(request: EstimationAdvisorRequest) {
  return apiRequest<EstimationAdvisorResponse>("/advisor/estimate-plan", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function advisorChat(request: EstimationAdvisorChatRequest) {
  return apiRequest<EstimationAdvisorChatResponse>("/advisor/chat", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function listSavedEstimates() {
  return apiRequest<SavedEstimateRecord[]>("/estimates");
}

export function createSavedEstimate(request: SavedEstimateCreate) {
  return apiRequest<SavedEstimateRecord>("/estimates", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function deleteSavedEstimate(estimateId: number) {
  return apiRequest<{ status: string }>(`/estimates/${estimateId}`, {
    method: "DELETE"
  });
}

export function listActualObservations() {
  return apiRequest<EstimateActualRecord[]>("/actuals");
}

export function createActualObservation(request: EstimateActualCreate) {
  return apiRequest<EstimateActualRecord>("/actuals", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function importBillingSnapshot(request: BillingImportRequest) {
  return apiRequest<BillingImportResponse>("/actuals/import-local", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function refreshLivePricing(request: LivePricingRefreshRequest) {
  return apiRequest<LivePricingRefreshResponse>("/catalog/refresh-live-pricing", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function getAllocatorContracts() {
  return apiRequest<ResourceAllocatorContractResponse>("/allocator/contracts");
}

export function executeAllocator(request: ResourceAllocatorRequest) {
  return apiRequest<ResourceAllocatorResponse>("/allocator/execute", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function createAllocatorRun(request: AllocatorRunCreateRequest) {
  return apiRequest<AllocatorRunResponse>("/allocator/runs", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function listAllocatorRuns() {
  return apiRequest<AllocatorRunListResponse>("/allocator/runs");
}

export function getAllocatorRun(runId: number) {
  return apiRequest<AllocatorRunRecord>(`/allocator/runs/${runId}`);
}

export function listPendingAllocatorApprovals() {
  return apiRequest<PendingApprovalListResponse>("/allocator/approvals/pending");
}

export function approveAllocatorRun(runId: number, request: ApprovalActionRequest) {
  return apiRequest<AllocatorRunResponse>(`/allocator/approvals/${runId}/approve`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function rejectAllocatorRun(runId: number, request: ApprovalActionRequest) {
  return apiRequest<AllocatorRunResponse>(`/allocator/approvals/${runId}/reject`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function validateAllocatorBudget(runId: number, request: BudgetValidationActionRequest) {
  return apiRequest<AllocatorRunResponse>(`/allocator/runs/${runId}/budget-validation`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function allocateAllocatorRun(runId: number, request: AllocationActionRequest) {
  return apiRequest<AllocatorRunResponse>(`/allocator/runs/${runId}/allocate`, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function listAllocatorAuditLogs() {
  return apiRequest<AuditLogListResponse>("/allocator/audit-logs");
}
