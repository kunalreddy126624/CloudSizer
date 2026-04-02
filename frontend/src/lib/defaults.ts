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
  preferred_providers: [
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
};

export const optionSets = {
  workloadTypes: [
    { value: "erp", label: "ERP" },
    { value: "crm", label: "CRM" },
    { value: "application", label: "Application" },
    { value: "ecommerce", label: "E-Commerce" },
    { value: "analytics", label: "Analytics / BI" },
    { value: "ai_ml", label: "AI / ML" },
    { value: "vdi", label: "VDI" },
    { value: "dev_test", label: "Dev / Test" },
    { value: "web_api", label: "Web / API" },
    { value: "saas", label: "SaaS Platform" }
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
  providers: [
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
  ] as const
};
