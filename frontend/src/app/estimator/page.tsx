import type { Metadata } from "next";

import { EstimatorShell } from "@/components/estimator/estimator-shell";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Form Estimator",
  description:
    "Enter workload requirements in CloudSizer's structured estimator to compare multi-cloud architectures, provider scores, and monthly cost estimates.",
  path: "/estimator",
  keywords: ["cloud estimator form", "multi-cloud recommendation tool", "cloud workload calculator"]
});

export default function EstimatorPage() {
  return <EstimatorShell />;
}
