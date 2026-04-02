import type { Metadata } from "next";

import { ArchitectWorkspace } from "@/components/architect/architect-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Architecture Canvas",
  description:
    "Open the CloudSizer architecture canvas to refine cloud diagrams, workload context, and architecture planning outputs.",
  path: "/architect/canvas",
  keywords: ["architecture canvas", "cloud diagram workspace"],
  index: false
});

export default function ArchitectCanvasPage() {
  return <ArchitectWorkspace canvasOnly />;
}
