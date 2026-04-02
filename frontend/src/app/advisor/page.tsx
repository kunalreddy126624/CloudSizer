import type { Metadata } from "next";

import { AdvisorWorkspace } from "@/components/advisor/advisor-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Estimation Advisor",
  description:
    "Use CloudSizer's chat-driven advisor to describe a workload and generate multi-cloud recommendations, provider rankings, and cost estimates.",
  path: "/advisor",
  keywords: ["cloud advisor", "chat-based cloud estimator", "workload recommendation engine"]
});

export default function AdvisorPage() {
  return <AdvisorWorkspace />;
}
