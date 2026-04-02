"use client";

import type { ReactNode } from "react";

import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

import { AuthProvider } from "@/components/auth/auth-provider";
import { AppShell } from "@/components/navigation/app-shell";
import { theme } from "@/theme/theme";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <AppShell>{children}</AppShell>
      </AuthProvider>
    </ThemeProvider>
  );
}
