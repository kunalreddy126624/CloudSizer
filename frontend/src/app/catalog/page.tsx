import type { Metadata } from "next";

import { CatalogComparisonWorkspace } from "@/components/catalog/catalog-comparison-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Cloud Service Catalog",
  description:
    "Compare cloud services across providers and browse categorized infrastructure options before generating recommendations or pricing estimates.",
  path: "/catalog",
  keywords: ["cloud service catalog", "AWS Azure GCP service comparison", "cloud service comparison"]
});

export default function CatalogPage() {
  return <CatalogComparisonWorkspace />;
}
