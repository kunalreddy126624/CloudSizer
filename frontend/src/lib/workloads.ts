import type { WorkloadType } from "@/lib/types";

export const workloadLabels: Record<WorkloadType, string> = {
  erp: "ERP",
  crm: "CRM",
  application: "Application",
  ecommerce: "E-Commerce",
  analytics: "Analytics / BI",
  ai_ml: "AI / ML",
  vdi: "VDI",
  dev_test: "Dev / Test",
  web_api: "Web / API",
  saas: "SaaS Platform"
};

export function formatWorkloadLabel(workload: WorkloadType) {
  return workloadLabels[workload];
}
