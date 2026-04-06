import type { Metadata } from "next";

import { NoodleDesignerWorkspace } from "@/components/noodle/noodle-designer-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Pipeline Designer",
  description:
    "Open the dedicated Noodle Pipeline Designer to build, validate, and version DAG-based data pipelines.",
  path: "/noodle/designer",
  keywords: ["pipeline designer", "dag editor", "react flow", "data orchestration"],
  index: false
});

export default function NoodleDesignerPage() {
  return <NoodleDesignerWorkspace />;
}
