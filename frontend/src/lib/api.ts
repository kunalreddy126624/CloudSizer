import type {
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
  ProviderSummary,
  RecommendationRequest,
  RecommendationResponse,
  SavedEstimateCreate,
  SavedEstimateRecord,
  ServiceCategory,
  ServiceComparisonGroup,
  ServicePricingRequest,
  ServicePricingResponse
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

export function loginUser(request: AuthLoginRequest) {
  return apiRequest<AuthLoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function getCurrentUser() {
  return apiRequest<AuthenticatedUser>("/auth/me");
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
