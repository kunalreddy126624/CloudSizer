import type { Metadata } from "next";

import { SignupWorkspace } from "@/components/auth/signup-workspace";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Sign Up",
  description: "Prepare a CloudSizer signup request, use demo access, and enter the agent estimator from one place.",
  path: "/signup",
  index: false
});

export default function SignupPage() {
  return <SignupWorkspace />;
}
