"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  Stack,
  Typography
} from "@mui/material";

import { useAuth } from "@/components/auth/auth-provider";
import { listSavedEstimates } from "@/lib/api";
import { loadGuestUsageSummary } from "@/lib/guest-usage";

const applications = [
  {
    name: "Agent Estimator",
    href: "/advisor",
    tag: "Recommended",
    description: "Describe the workload in plain language and get a full recommendation set in one run."
  },
  {
    name: "Agent Allocator",
    href: "/allocator",
    tag: "Provision",
    description: "Turn an approved estimate into a cloud-account plan, Terraform bundle, and gated provisioning run."
  },
  {
    name: "Noodle Orchestrator",
    href: "/noodle",
    tag: "Data Platform",
    description: "Design AI-driven data orchestration across hybrid, multi-cloud, and edge environments from one control plane."
  },
  {
    name: "Form Estimator",
    href: "/estimator",
    tag: "Structured",
    description: "Build workload inputs field by field and compare ranked cloud architectures."
  },
  {
    name: "Service Pricing",
    href: "/pricing",
    tag: "Calculator",
    description: "Price individual cloud services, tune usage, and assemble line-item estimates."
  },
  {
    name: "Agent Architect",
    href: "/architect",
    tag: "Design",
    description: "Turn workload context into architecture plans and diagram-ready drafts."
  },
  {
    name: "Service Catalog",
    href: "/catalog",
    tag: "Reference",
    description: "Browse comparable services across providers before you estimate or price."
  },
  {
    name: "Saved Work",
    href: "/estimates",
    tag: "History",
    description: "Reopen saved estimates and architecture drafts, then continue from where you stopped."
  }
] as const;

function formatSavedEstimateDate(value: string | null) {
  if (!value) {
    return "No saved estimates yet";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function ApplicationWorkspace() {
  const { isAuthenticated, loading, user } = useAuth();
  const [savedEstimateCount, setSavedEstimateCount] = useState(0);
  const [latestSavedEstimateAt, setLatestSavedEstimateAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [guestSummary, setGuestSummary] = useState(loadGuestUsageSummary);

  useEffect(() => {
    setGuestSummary(loadGuestUsageSummary());
  }, [isAuthenticated]);

  useEffect(() => {
    if (loading || !isAuthenticated) {
      setSavedEstimateCount(0);
      setLatestSavedEstimateAt(null);
      setLoadError(null);
      return;
    }

    let active = true;

    async function loadWorkspaceSummary() {
      try {
        const estimates = await listSavedEstimates();
        if (!active) {
          return;
        }

        setSavedEstimateCount(estimates.length);
        setLatestSavedEstimateAt(estimates[0]?.created_at ?? null);
        setLoadError(null);
      } catch (summaryError) {
        if (active) {
          setLoadError(summaryError instanceof Error ? summaryError.message : "Failed to load workspace summary.");
        }
      }
    }

    void loadWorkspaceSummary();

    return () => {
      active = false;
    };
  }, [isAuthenticated, loading]);

  const greeting = useMemo(() => {
    if (!user?.full_name) {
      return "CloudSizer workspace";
    }

    return `${user.full_name.split(" ")[0]}'s workspace`;
  }, [user?.full_name]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        py: { xs: 4, md: 7 },
        background:
          "radial-gradient(circle at top left, rgba(100, 167, 255, 0.18), transparent 22%), radial-gradient(circle at top right, rgba(12, 107, 88, 0.12), transparent 22%), linear-gradient(180deg, #f8fbff 0%, #edf4ff 100%)"
      }}
    >
      <Container maxWidth="xl">
        <Stack spacing={4}>
          <Card
            sx={{
              borderRadius: 6,
              border: "1px solid var(--line)",
              boxShadow: "none",
              background: "var(--hero)"
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Stack spacing={2.5}>
                <Stack
                  direction={{ xs: "column", lg: "row" }}
                  spacing={2}
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", lg: "center" }}
                >
                  <Stack spacing={1.5}>
                    <Chip
                      label={isAuthenticated ? "Workspace" : "Guest Workspace"}
                      sx={{ width: "fit-content", bgcolor: "var(--accent-soft)", color: "var(--accent)" }}
                    />
                    <Typography variant="h2" sx={{ fontSize: { xs: "2.5rem", md: "4rem" }, lineHeight: 0.98 }}>
                      {isAuthenticated ? `${greeting}.` : "Open every CloudSizer application from one place."}
                    </Typography>
                    <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 860 }}>
                      Jump straight into the estimator, pricing calculator, agent architect, advisor, catalog,
                      or saved estimates instead of landing on an empty page after sign-in.
                    </Typography>
                  </Stack>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <Button
                      component={Link}
                      href={isAuthenticated ? "/advisor" : "/workspace"}
                      variant="contained"
                      sx={{ bgcolor: "#163b73", color: "#ffffff", minWidth: 220, "&:hover": { bgcolor: "#102443" } }}
                    >
                      {isAuthenticated ? "Open Agent Estimator" : "Explore Applications"}
                    </Button>
                  </Stack>
                </Stack>

                {!isAuthenticated ? (
                  <Alert severity={guestSummary.remaining > 0 ? "info" : "warning"}>
                    Guest access is limited to {guestSummary.max} estimate runs total. You have {guestSummary.remaining}{" "}
                    remaining before sign-in is required.
                  </Alert>
                ) : null}

                {loadError ? <Alert severity="error">{loadError}</Alert> : null}

                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                      <CardContent>
                        <Typography variant="overline">Applications</Typography>
                        <Typography variant="h4">{applications.length}</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Estimator, advisor, pricing, architecture, catalog, and saved work.
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                      <CardContent>
                        <Typography variant="overline">Saved Work</Typography>
                        <Typography variant="h4">{isAuthenticated ? savedEstimateCount : "--"}</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          {isAuthenticated ? formatSavedEstimateDate(latestSavedEstimateAt) : "Available after sign-in"}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                      <CardContent>
                        <Typography variant="overline">Access Level</Typography>
                        <Typography variant="h4">{isAuthenticated ? "Full" : `${guestSummary.remaining}/${guestSummary.max}`}</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          {isAuthenticated ? "Unlimited usage across all workspaces." : "Guest estimate runs remaining."}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>

          <Grid container spacing={3}>
            {applications.map((application) => {
              const loginRequired = application.href === "/estimates" && !isAuthenticated;

              return (
                <Grid item xs={12} md={6} xl={4} key={application.href}>
                  <Card
                    sx={{
                      height: "100%",
                      borderRadius: 5,
                      border: "1px solid var(--line)",
                      boxShadow: "none",
                      bgcolor: "rgba(255,255,255,0.9)"
                    }}
                  >
                    <CardContent sx={{ p: 3.2 }}>
                      <Stack spacing={2}>
                        <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
                          <Box>
                            <Typography variant="h5">{application.name}</Typography>
                            <Typography variant="body2" sx={{ color: "var(--muted)", mt: 0.8 }}>
                              {application.description}
                            </Typography>
                          </Box>
                          <Chip label={application.tag} />
                        </Stack>
                        <Button
                          component={Link}
                          href={loginRequired ? "/login" : application.href}
                          variant="contained"
                          sx={{
                            alignSelf: "flex-start",
                            bgcolor: loginRequired ? "#17315c" : "var(--accent)",
                            color: "#ffffff",
                            "&:hover": { bgcolor: loginRequired ? "#102443" : "#265db8" }
                          }}
                        >
                          {loginRequired ? "Sign In To Open" : "Open Application"}
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}
