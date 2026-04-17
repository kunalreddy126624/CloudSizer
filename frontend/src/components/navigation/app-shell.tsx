"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Alert, Box, Button, Chip, Container, Stack, Typography } from "@mui/material";

import { useAuth } from "@/components/auth/auth-provider";
import type { PermissionName } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  requiredAnyPermission?: PermissionName[];
};

const navItems: NavItem[] = [
  { href: "/workspace", label: "Workspace" },
  { href: "/rbac", label: "RBAC", requiredAnyPermission: ["manage_users"] },
  { href: "/advisor", label: "Agent Estimator", requiredAnyPermission: ["create_estimation", "view_estimation"] },
  {
    href: "/allocator",
    label: "Agent Allocator",
    requiredAnyPermission: ["create_estimation", "approve_request", "reject_request", "view_cost", "allocate_resources"]
  },
  { href: "/noodle", label: "Noodle" },
  { href: "/estimator", label: "Form Estimator", requiredAnyPermission: ["create_estimation", "view_estimation"] },
  { href: "/pricing", label: "Pricing", requiredAnyPermission: ["view_cost"] },
  { href: "/architect", label: "Architect", requiredAnyPermission: ["create_estimation", "view_estimation"] },
  { href: "/catalog", label: "Catalog" },
  { href: "/estimates", label: "Saved Work", requiredAnyPermission: ["view_estimation", "create_estimation"] }
];

function isRouteActive(pathname: string, href: string) {
  if (href === "/workspace") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, isRbacSession, loading, logout, permissions, roles, user } = useAuth();

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
                const isRestricted = isRbacSession && Boolean(item.requiredAnyPermission?.length);
                const hasAnyRequiredPermission = item.requiredAnyPermission
                  ? item.requiredAnyPermission.some((permission) => permissions.includes(permission))
                  : true;
                const canAccess = !isRestricted || hasAnyRequiredPermission;

                return (
                  <Button
                    key={item.href}
                    component={Link}
                    href={item.href}
                    variant={active ? "contained" : "outlined"}
                    size="small"
                    disabled={!canAccess}
                    sx={
                      active
                        ? {
                            bgcolor: "var(--accent)",
                            color: "#ffffff",
                            "&:hover": { bgcolor: "#265db8" }
                          }
                        : {
                            borderColor: "var(--line)",
                            color: "var(--text)",
                            opacity: canAccess ? 1 : 0.5
                          }
                    }
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                label={isRbacSession ? "RBAC Session Active" : "RBAC Session Not Active"}
                color={isRbacSession ? "success" : "default"}
                variant={isRbacSession ? "filled" : "outlined"}
              />
              {isRbacSession ? (
                <>
                  <Chip label={`Roles: ${roles.length ? roles.join(", ") : "none"}`} variant="outlined" />
                  <Chip label={`Permissions: ${permissions.length}`} variant="outlined" />
                </>
              ) : (
                <Typography variant="caption" sx={{ color: "var(--muted)", alignSelf: "center" }}>
                  Sign in with RBAC credentials to enable role-based navigation and guarded actions.
                </Typography>
              )}
            </Stack>
            {isRbacSession ? (
              <Alert severity="success" variant="outlined">
                RBAC enabled. Roles: {roles.length ? roles.join(", ") : "none"}.
              </Alert>
            ) : (
              <Alert severity="warning" variant="outlined">
                This session does not include RBAC roles. Actions are hidden and the dashboard is read-only until you sign in with an RBAC JWT.
              </Alert>
            )}
          </Stack>
        </Container>
      </Box>

      <Box component="main">{children}</Box>
    </Box>
  );
}
