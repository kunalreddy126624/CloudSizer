import type { Metadata } from "next";

import { RbacWorkspace } from "@/components/rbac/rbac-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "RBAC Console",
  description: "Manage RBAC users, role assignments, and permission visibility from the CloudSizer UI.",
  path: "/rbac",
  index: false
});

export default function RbacPage() {
  return <RbacWorkspace />;
}
