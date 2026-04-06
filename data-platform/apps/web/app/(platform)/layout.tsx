import type { PropsWithChildren } from "react";

import { AppShell } from "@/components/app-shell";

export default function PlatformLayout({ children }: PropsWithChildren) {
  return <AppShell>{children}</AppShell>;
}
