import type { Metadata } from "next";

import { EstimatesWorkspace } from "@/components/estimates/estimates-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Saved Work",
  description: "Review and reopen saved CloudSizer estimates and architecture drafts from one workspace.",
  path: "/estimates",
  index: false
});

export default function EstimatesPage() {
  return <EstimatesWorkspace />;
}
