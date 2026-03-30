import type { RecommendationRequest } from "@/lib/types";

export const DEFAULT_REQUEST: RecommendationRequest = {
  workload_type: "erp",
  region: "ap-south-1",
  user_count: 120,
  concurrent_users: 40,
  storage_gb: 500,
  monthly_requests_million: 1.2,
  requires_disaster_recovery: false,
  requires_managed_database: true,
  availability_tier: "high",
  budget_preference: "balanced",
  preferred_providers: ["aws", "azure", "gcp"]
};

export const optionSets = {
  workloadTypes: [
    { value: "erp", label: "ERP" },
    { value: "crm", label: "CRM" },
    { value: "application", label: "Application" }
  ],
  availabilityTiers: [
    { value: "standard", label: "Standard" },
    { value: "high", label: "High Availability" },
    { value: "mission_critical", label: "Mission Critical" }
  ],
  budgetPreferences: [
    { value: "lowest_cost", label: "Lowest Cost" },
    { value: "balanced", label: "Balanced" },
    { value: "enterprise", label: "Enterprise" }
  ],
  providers: ["aws", "azure", "gcp"] as const
};
