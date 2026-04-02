import type { Metadata } from "next";

import { EstimatesWorkspace } from "@/components/estimates/estimates-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Saved Estimates",
  description: "Review and reopen saved CloudSizer advisor and pricing estimates tied to your account.",
  path: "/estimates",
  index: false
});

export default function EstimatesPage() {
  return <EstimatesWorkspace />;
}
