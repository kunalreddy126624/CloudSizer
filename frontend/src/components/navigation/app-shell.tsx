"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Box, Button, Chip, Container, Stack, Typography } from "@mui/material";

import { useAuth } from "@/components/auth/auth-provider";

const navItems = [
  { href: "/workspace", label: "Workspace" },
  { href: "/advisor", label: "Agent Estimator" },
  { href: "/allocator", label: "Agent Allocator" },
  { href: "/noodle", label: "Noodle" },
  { href: "/estimator", label: "Form Estimator" },
  { href: "/pricing", label: "Pricing" },
  { href: "/architect", label: "Architect" },
  { href: "/catalog", label: "Catalog" },
  { href: "/estimates", label: "Saved Work" }
] as const;

function isRouteActive(pathname: string, href: string) {
  if (href === "/workspace") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, loading, logout, user } = useAuth();

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          backdropFilter: "blur(18px)",
          background: "rgba(248, 251, 255, 0.88)",
          borderBottom: "1px solid var(--line)"
        }}
      >
        <Container maxWidth="xl" sx={{ py: 1.5 }}>
          <Stack spacing={1.5}>
            <Stack
              direction={{ xs: "column", lg: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", lg: "center" }}
              spacing={1.5}
            >
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip
                  component={Link}
                  clickable
                  href="/"
                  label="CloudSizer"
                  sx={{
                    bgcolor: "var(--accent-soft)",
                    color: "var(--accent)",
                    fontWeight: 800,
                    border: "1px solid var(--line-strong)"
                  }}
                />
                <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                  Multi-cloud sizing, pricing, and architecture workspace
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1.2} alignItems="center" flexWrap="wrap" useFlexGap>
                {isAuthenticated && user ? (
                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                    {user.full_name}
                  </Typography>
                ) : null}
                {isAuthenticated ? (
                  <Button variant="outlined" onClick={() => void logout()}>
                    Sign Out
                  </Button>
                ) : (
                  <>
                    <Button component={Link} href="/login" variant="outlined" disabled={loading}>
                      {loading ? "Checking..." : "Login"}
                    </Button>
                    <Button component={Link} href="/signup" variant="contained" disabled={loading}>
                      {loading ? "Checking..." : "Sign Up"}
                    </Button>
                  </>
                )}
              </Stack>
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {navItems.map((item) => {
                const active = isRouteActive(pathname, item.href);

                return (
                  <Button
                    key={item.href}
                    component={Link}
                    href={item.href}
                    variant={active ? "contained" : "outlined"}
                    size="small"
                    sx={
                      active
                        ? {
                            bgcolor: "var(--accent)",
                            color: "#ffffff",
                            "&:hover": { bgcolor: "#265db8" }
                          }
                        : {
                            borderColor: "var(--line)",
                            color: "var(--text)"
                          }
                    }
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Box component="main">{children}</Box>
    </Box>
  );
}
