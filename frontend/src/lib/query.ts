import type { CloudProvider, RecommendationRequest } from "@/lib/types";

export function buildRecommendationDetailHref(
  request: RecommendationRequest,
  provider: CloudProvider
) {
  const params = new URLSearchParams({
    workload_type: request.workload_type,
    region: request.region,
    user_count: String(request.user_count),
    concurrent_users: String(request.concurrent_users),
    storage_gb: String(request.storage_gb),
    monthly_requests_million: String(request.monthly_requests_million),
    requires_disaster_recovery: String(request.requires_disaster_recovery),
    requires_managed_database: String(request.requires_managed_database),
    availability_tier: request.availability_tier,
    budget_preference: request.budget_preference,
    preferred_providers: request.preferred_providers.join(",")
  });

  return `/recommendations/${provider}?${params.toString()}`;
}

export function parseRecommendationRequest(
  searchParams: URLSearchParams
): RecommendationRequest {
  return {
    workload_type: (searchParams.get("workload_type") ?? "erp") as RecommendationRequest["workload_type"],
    region: searchParams.get("region") ?? "ap-south-1",
    user_count: Number(searchParams.get("user_count") ?? 120),
    concurrent_users: Number(searchParams.get("concurrent_users") ?? 40),
    storage_gb: Number(searchParams.get("storage_gb") ?? 500),
    monthly_requests_million: Number(searchParams.get("monthly_requests_million") ?? 1.2),
    requires_disaster_recovery: searchParams.get("requires_disaster_recovery") === "true",
    requires_managed_database: searchParams.get("requires_managed_database") !== "false",
    availability_tier: (searchParams.get("availability_tier") ?? "high") as RecommendationRequest["availability_tier"],
    budget_preference: (searchParams.get("budget_preference") ?? "balanced") as RecommendationRequest["budget_preference"],
    preferred_providers: (
      searchParams.get("preferred_providers")?.split(",").filter(Boolean) ?? [
        "aws",
        "azure",
        "gcp",
        "oracle",
        "alibaba",
        "ibm",
        "tencent",
        "digitalocean",
        "akamai",
        "ovhcloud",
        "cloudflare"
      ]
    ) as RecommendationRequest["preferred_providers"]
  };
}
