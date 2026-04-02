import type { Metadata } from "next";

import { RecommendationDetailShell } from "@/components/recommendations/recommendation-detail-shell";
import { buildPageMetadata } from "@/lib/seo";

function formatProvider(provider: string) {
  return provider.replaceAll("-", " ").replaceAll("_", " ").toUpperCase();
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ provider: string }>;
}): Promise<Metadata> {
  const { provider } = await params;

  return buildPageMetadata({
    title: `${formatProvider(provider)} Recommendation Detail`,
    description:
      "Inspect CloudSizer's detailed recommendation output, pricing rationale, and service breakdown for a selected cloud provider.",
    path: `/recommendations/${provider}`,
    keywords: ["cloud recommendation detail", "provider recommendation breakdown"],
    index: false
  });
}

export default function RecommendationDetailPage() {
  return <RecommendationDetailShell />;
}
