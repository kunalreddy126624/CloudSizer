import type { Metadata } from "next";

import { AllocatorWorkspace } from "@/components/allocator/allocator-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Agent Allocator",
  description:
    "Use CloudSizer's allocator to turn approved estimates into cloud-account strategies, Terraform bundles, policy checks, and provisioning handoffs.",
  path: "/allocator",
  keywords: ["cloud account vending", "terraform allocator", "cloud provisioning agent"]
});

export default function AllocatorPage() {
  return <AllocatorWorkspace />;
}
