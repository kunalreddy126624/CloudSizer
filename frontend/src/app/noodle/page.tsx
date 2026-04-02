import type { Metadata } from "next";

import { NoodleWorkspace } from "@/components/noodle/noodle-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Noodle Orchestrator",
  description:
    "Design AI-driven data orchestration across hybrid, multi-cloud, and edge environments with the Noodle Orchestrator control plane.",
  path: "/noodle",
  keywords: ["data orchestration", "lakehouse", "hybrid data platform", "ai data pipelines"]
});

export default function NoodlePage() {
  return <NoodleWorkspace />;
}
