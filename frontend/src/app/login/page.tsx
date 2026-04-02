import type { Metadata } from "next";

import { LoginWorkspace } from "@/components/auth/login-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Login",
  description: "Sign in to CloudSizer to access your workspace, saved estimates, and team-ready planning flows.",
  path: "/login",
  index: false
});

export default function LoginPage() {
  return <LoginWorkspace />;
}
