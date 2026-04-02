import type { Metadata } from "next";

import { ArchitectWorkspace } from "@/components/architect/architect-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Agent Architect",
  description:
    "Design cloud architecture plans and convert workload inputs into implementation-ready infrastructure views with CloudSizer Agent Architect.",
  path: "/architect",
  keywords: ["cloud architecture planner", "infrastructure design workspace", "agent architect"]
});

export default function ArchitectPage() {
  return <ArchitectWorkspace />;
}
