import type { Metadata } from "next";
import { Suspense } from "react";

import { PricingWorkspace } from "@/components/pricing/pricing-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Service Pricing Calculator",
  description:
    "Calculate line-item cloud pricing across providers, tune usage dimensions, and build service-level cost estimates with CloudSizer.",
  path: "/pricing",
  keywords: ["cloud pricing calculator", "service pricing estimator", "cloud cost calculator"]
});

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingWorkspace />
    </Suspense>
  );
}
