"use client";

import type { PropsWithChildren } from "react";

import { AppQueryProvider } from "@/lib/query-client";

export function Providers({ children }: PropsWithChildren) {
  return <AppQueryProvider>{children}</AppQueryProvider>;
}
