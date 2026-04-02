import type { Metadata } from "next";

import { ApplicationWorkspace } from "@/components/workspace/application-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Application Workspace",
  description: "Access CloudSizer's advisor, estimator, pricing, catalog, architecture, and saved estimate workflows from one hub.",
  path: "/workspace",
  index: false
});

export default function WorkspacePage() {
  return <ApplicationWorkspace />;
}
