"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Grid,
  Stack,
  Typography
} from "@mui/material";

import { useAuth } from "@/components/auth/auth-provider";
import { deleteSavedEstimate, listSavedEstimates } from "@/lib/api";
import {
  storePendingArchitectScenario,
  storePendingEstimatorScenario
} from "@/lib/scenario-store";
import type { RecommendationRequest, SavedEstimateRecord } from "@/lib/types";

function formatEstimateType(estimateType: SavedEstimateRecord["estimate_type"]) {
  return estimateType.replaceAll("_", " ");
}

const workloadTypes = new Set<RecommendationRequest["workload_type"]>(["erp", "crm", "application"]);
const availabilityTiers = new Set<RecommendationRequest["availability_tier"]>([
  "standard",
  "high",
  "mission_critical"
]);
const budgetPreferences = new Set<RecommendationRequest["budget_preference"]>([
  "lowest_cost",
  "balanced",
  "enterprise"
]);
const providers = new Set<RecommendationRequest["preferred_providers"][number]>([
  "aws",
  "azure",
  "gcp",
  "oracle",
  "alibaba",
  "ibm",
  "tencent",
  "digitalocean",
  "akamai",
  "ovhcloud",
  "cloudflare"
]);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRecommendationRequest(value: unknown): RecommendationRequest | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const {
    workload_type,
    region,
    user_count,
    concurrent_users,
    storage_gb,
    monthly_requests_million,
    requires_disaster_recovery,
    requires_managed_database,
    availability_tier,
    budget_preference,
    preferred_providers
  } = value;

  if (
    !workloadTypes.has(workload_type as RecommendationRequest["workload_type"]) ||
    typeof region !== "string" ||
    typeof user_count !== "number" ||
    typeof concurrent_users !== "number" ||
    typeof storage_gb !== "number" ||
    typeof monthly_requests_million !== "number" ||
    typeof requires_disaster_recovery !== "boolean" ||
    typeof requires_managed_database !== "boolean" ||
    !availabilityTiers.has(availability_tier as RecommendationRequest["availability_tier"]) ||
    !budgetPreferences.has(budget_preference as RecommendationRequest["budget_preference"]) ||
    !Array.isArray(preferred_providers) ||
    preferred_providers.some((provider) => !providers.has(provider as RecommendationRequest["preferred_providers"][number]))
  ) {
    return null;
  }

  return {
    workload_type: workload_type as RecommendationRequest["workload_type"],
    region,
    user_count,
    concurrent_users,
    storage_gb,
    monthly_requests_million,
    requires_disaster_recovery,
    requires_managed_database,
    availability_tier: availability_tier as RecommendationRequest["availability_tier"],
    budget_preference: budget_preference as RecommendationRequest["budget_preference"],
    preferred_providers:
      preferred_providers as RecommendationRequest["preferred_providers"]
  };
}

function extractEstimatorRequest(estimate: SavedEstimateRecord): RecommendationRequest | null {
  const payload = isObjectRecord(estimate.payload) ? estimate.payload : null;

  if (!payload) {
    return null;
  }

  const directRequest = parseRecommendationRequest(payload.request);
  if (directRequest) {
    return directRequest;
  }

  const inferredRequest = parseRecommendationRequest(payload.inferred_request);
  if (inferredRequest) {
    return inferredRequest;
  }

  const recommendation = isObjectRecord(payload.recommendation) ? payload.recommendation : null;
  if (!recommendation) {
    return null;
  }

  return parseRecommendationRequest(recommendation.baseline_inputs);
}

export function EstimatesWorkspace() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [estimates, setEstimates] = useState<SavedEstimateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (authLoading || !isAuthenticated) {
      setLoading(false);
      return;
    }

    let active = true;

    async function loadEstimates() {
      setLoading(true);
      setError(null);

      try {
        const response = await listSavedEstimates();
        if (!active) {
          return;
        }

        setEstimates(response);
        setSelectedEstimateId((current) => current ?? response[0]?.id ?? null);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load saved estimates.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadEstimates();

    return () => {
      active = false;
    };
  }, [authLoading, isAuthenticated]);

  const selectedEstimate = useMemo(
    () => estimates.find((estimate) => estimate.id === selectedEstimateId) ?? null,
    [estimates, selectedEstimateId]
  );
  const selectedEstimatorRequest = useMemo(
    () => (selectedEstimate ? extractEstimatorRequest(selectedEstimate) : null),
    [selectedEstimate]
  );

  async function handleDeleteEstimate(estimateId: number) {
    setDeletingId(estimateId);
    setError(null);

    try {
      await deleteSavedEstimate(estimateId);
      setEstimates((current) => current.filter((estimate) => estimate.id !== estimateId));
      setSelectedEstimateId((current) => (current === estimateId ? null : current));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete estimate.");
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    if (!selectedEstimateId && estimates.length) {
      setSelectedEstimateId(estimates[0].id);
    }
  }, [estimates, selectedEstimateId]);

  function handleOpenInEstimator(estimate: SavedEstimateRecord, request: RecommendationRequest) {
    storePendingEstimatorScenario({
      name: estimate.name,
      request,
      source: "saved_estimate",
      estimate_id: estimate.id,
      imported_at: new Date().toISOString()
    });
    router.push("/estimator");
  }

  function handleOpenInArchitect(estimate: SavedEstimateRecord, request: RecommendationRequest) {
    storePendingArchitectScenario({
      name: estimate.name,
      request,
      source: "saved_estimate",
      estimate_id: estimate.id,
      imported_at: new Date().toISOString()
    });
    router.push("/architect");
  }

  return (
    <Box sx={{ py: { xs: 4, md: 7 } }}>
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
              <Stack spacing={1.5}>
                <Chip
                  label="Saved Estimates"
                  sx={{ width: "fit-content", bgcolor: "rgba(12, 107, 88, 0.12)", color: "var(--accent)" }}
                />
                <Typography variant="h2" sx={{ fontSize: { xs: "2.3rem", md: "3.8rem" }, lineHeight: 0.98 }}>
                  Reopen saved advisor and pricing drafts from one place.
                </Typography>
                <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 760 }}>
                  Use this workspace to review saved estimates, compare totals, and delete outdated drafts once
                  you have refined the architecture.
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {error ? <Alert severity="error">{error}</Alert> : null}

          {!authLoading && !isAuthenticated ? (
            <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
              <CardContent sx={{ p: 4 }}>
                <Stack spacing={2}>
                  <Typography variant="h5">Login Required</Typography>
                  <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 720 }}>
                    Saved estimates are now tied to your authenticated account. Sign in first to view,
                    create, or delete estimate records.
                  </Typography>
                  <Button
                    component={Link}
                    href="/login"
                    variant="contained"
                    sx={{ alignSelf: "flex-start", bgcolor: "var(--accent)", "&:hover": { bgcolor: "#265db8" } }}
                  >
                    Go To Login
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {authLoading ? (
            <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
              <CardContent>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CircularProgress size={18} />
                  <Typography variant="body2">Checking authentication...</Typography>
                </Stack>
              </CardContent>
            </Card>
          ) : loading ? (
            <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
              <CardContent>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <CircularProgress size={18} />
                  <Typography variant="body2">Loading saved estimates...</Typography>
                </Stack>
              </CardContent>
            </Card>
          ) : isAuthenticated ? (
            <Grid container spacing={3}>
              <Grid item xs={12} lg={5}>
                <Stack spacing={2}>
                  {estimates.length ? (
                    estimates.map((estimate) => (
                      <Card
                        key={estimate.id}
                        sx={{
                          borderRadius: 4,
                          border: "1px solid var(--line)",
                          boxShadow: "none",
                          bgcolor:
                            estimate.id === selectedEstimateId ? "var(--accent-soft)" : "var(--panel-strong)"
                        }}
                      >
                        <CardContent>
                          <Stack spacing={1.2}>
                            <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
                              <Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                  {estimate.name}
                                </Typography>
                                <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                  {estimate.summary}
                                </Typography>
                              </Box>
                              <Chip label={`#${estimate.id}`} />
                            </Stack>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                              <Chip label={formatEstimateType(estimate.estimate_type)} size="small" />
                              {estimate.provider ? <Chip label={estimate.provider.toUpperCase()} size="small" /> : null}
                            </Stack>
                            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                              Created: {new Date(estimate.created_at).toLocaleString()}
                            </Typography>
                            <Typography variant="h6">
                              {estimate.estimated_monthly_cost_usd != null
                                ? `$${estimate.estimated_monthly_cost_usd.toFixed(2)}`
                                : "No cost total"}
                            </Typography>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                              <Button
                                variant="outlined"
                                onClick={() => setSelectedEstimateId(estimate.id)}
                                sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                              >
                                View Details
                              </Button>
                              <Button
                                color="inherit"
                                onClick={() => handleDeleteEstimate(estimate.id)}
                                disabled={deletingId === estimate.id}
                              >
                                {deletingId === estimate.id ? "Deleting..." : "Delete"}
                              </Button>
                            </Stack>
                          </Stack>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
                      <CardContent>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          No estimates are saved yet. Save a result from the advisor or pricing workspace to
                          build a project history here.
                        </Typography>
                      </CardContent>
                    </Card>
                  )}
                </Stack>
              </Grid>

              <Grid item xs={12} lg={7}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none", minHeight: "100%" }}>
                  <CardContent>
                    {selectedEstimate ? (
                      <Stack spacing={2}>
                        <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="center">
                          <Box>
                            <Typography variant="h5">{selectedEstimate.name}</Typography>
                            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                              {selectedEstimate.summary}
                            </Typography>
                          </Box>
                          {selectedEstimate.provider ? (
                            <Chip label={selectedEstimate.provider.toUpperCase()} />
                          ) : null}
                        </Stack>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Type: {formatEstimateType(selectedEstimate.estimate_type)} | Created:{" "}
                          {new Date(selectedEstimate.created_at).toLocaleString()}
                        </Typography>
                        {selectedEstimatorRequest ? (
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                            <Button
                              variant="contained"
                              onClick={() => handleOpenInEstimator(selectedEstimate, selectedEstimatorRequest)}
                              sx={{ alignSelf: "flex-start", bgcolor: "var(--accent)", "&:hover": { bgcolor: "#265db8" } }}
                            >
                              Open In Form Estimator
                            </Button>
                            <Button
                              variant="outlined"
                              onClick={() => handleOpenInArchitect(selectedEstimate, selectedEstimatorRequest)}
                              sx={{ alignSelf: "flex-start", borderColor: "var(--line)", color: "var(--text)" }}
                            >
                              Open In Agent Architect
                            </Button>
                          </Stack>
                        ) : (
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            This saved record does not include a reusable workload form payload.
                          </Typography>
                        )}
                        <Typography variant="h3">
                          {selectedEstimate.estimated_monthly_cost_usd != null
                            ? `$${selectedEstimate.estimated_monthly_cost_usd.toFixed(2)}`
                            : "No monthly total"}
                        </Typography>
                        <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                          <CardContent>
                            <Stack spacing={1}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                Stored Payload
                              </Typography>
                              <Box
                                component="pre"
                                sx={{
                                  m: 0,
                                  p: 2,
                                  overflowX: "auto",
                                  borderRadius: 3,
                                  border: "1px solid var(--line)",
                                  bgcolor: "#f5f7f2",
                                  fontSize: "0.8rem",
                                  lineHeight: 1.5,
                                  fontFamily: '"Cascadia Mono", "Consolas", monospace'
                                }}
                              >
                                {JSON.stringify(selectedEstimate.payload, null, 2)}
                              </Box>
                            </Stack>
                          </CardContent>
                        </Card>
                      </Stack>
                    ) : (
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Select a saved estimate to inspect the stored request and response payload.
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          ) : null}
        </Stack>
      </Container>
    </Box>
  );
}
