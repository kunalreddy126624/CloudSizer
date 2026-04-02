"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { useAuth } from "@/components/auth/auth-provider";
import { createActualObservation, deleteSavedEstimate, importBillingSnapshot, listActualObservations, listSavedEstimates } from "@/lib/api";
import {
  deleteSavedArchitectureDraft,
  loadSavedArchitectureDrafts,
  storeArchitectCanvasDraft,
  storePendingArchitectScenario,
  storePendingEstimatorScenario
} from "@/lib/scenario-store";
import type { SavedArchitectureDraft } from "@/lib/scenario-store";
import type { CloudProvider, EstimateActualRecord, RecommendationRequest, SavedEstimateRecord, WorkloadType } from "@/lib/types";

type SavedWorkFilter = "all" | "estimates" | "architectures";

function formatEstimateType(estimateType: SavedEstimateRecord["estimate_type"]) {
  return estimateType.replaceAll("_", " ");
}

const workloadTypes = new Set<RecommendationRequest["workload_type"]>([
  "erp",
  "crm",
  "application",
  "ecommerce",
  "analytics",
  "ai_ml",
  "vdi",
  "dev_test",
  "web_api",
  "saas"
]);
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

function extractArchitectScenario(
  estimate: SavedEstimateRecord
): { request: RecommendationRequest; prompt_override?: string } | null {
  const estimatorRequest = extractEstimatorRequest(estimate);
  if (estimatorRequest) {
    return { request: estimatorRequest };
  }

  const payload = isObjectRecord(estimate.payload) ? estimate.payload : null;
  const requestPayload = payload && isObjectRecord(payload.request) ? payload.request : null;
  const responsePayload = payload && isObjectRecord(payload.response) ? payload.response : null;
  const provider = requestPayload?.provider;
  const requestItems = Array.isArray(requestPayload?.items) ? requestPayload.items : [];
  const responseItems = Array.isArray(responsePayload?.items) ? responsePayload.items : [];

  if (!providers.has(provider as RecommendationRequest["preferred_providers"][number]) || !requestItems.length) {
    return null;
  }

  const region =
    requestItems.find((item) => isObjectRecord(item) && typeof item.region === "string")?.region ?? "global";
  const categorySet = new Set<string>();
  const serviceNames: string[] = [];

  responseItems.forEach((item) => {
    if (!isObjectRecord(item)) {
      return;
    }

    if (typeof item.category === "string") {
      categorySet.add(item.category);
    }

    if (typeof item.service_name === "string") {
      serviceNames.push(item.service_name);
    }
  });

  requestItems.forEach((item) => {
    if (isObjectRecord(item) && typeof item.service_code === "string" && serviceNames.length < 6) {
      serviceNames.push(item.service_code);
    }
  });

  const categories = Array.from(categorySet);
  const promptOverride = `${estimate.name}: Design a ${String(provider).toUpperCase()} architecture from this saved estimate for region ${region}, using services ${serviceNames.slice(0, 6).join(", ")}${categories.length ? ` across ${categories.join(", ")} categories` : ""}.`;

  return {
    request: {
      workload_type: "application",
      region,
      user_count: Math.max(requestItems.length * 25, 25),
      concurrent_users: Math.max(requestItems.length * 10, 10),
      storage_gb: 250,
      monthly_requests_million: Math.max(requestItems.length, 1),
      requires_disaster_recovery: categories.includes("storage"),
      requires_managed_database: categories.includes("database"),
      availability_tier: "high",
      budget_preference: "balanced",
      preferred_providers: [provider as RecommendationRequest["preferred_providers"][number]]
    },
    prompt_override: promptOverride
  };
}

export function EstimatesWorkspace() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [estimates, setEstimates] = useState<SavedEstimateRecord[]>([]);
  const [architectures, setArchitectures] = useState<SavedArchitectureDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEstimateId, setSelectedEstimateId] = useState<number | null>(null);
  const [selectedArchitectureId, setSelectedArchitectureId] = useState<string | null>(null);
  const [savedWorkFilter, setSavedWorkFilter] = useState<SavedWorkFilter>("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingArchitectureId, setDeletingArchitectureId] = useState<string | null>(null);
  const [actuals, setActuals] = useState<EstimateActualRecord[]>([]);
  const [actualCost, setActualCost] = useState("");
  const [billingPeriodStart, setBillingPeriodStart] = useState("");
  const [billingPeriodEnd, setBillingPeriodEnd] = useState("");
  const [actualNotes, setActualNotes] = useState("");
  const [savingActual, setSavingActual] = useState(false);
  const [importPath, setImportPath] = useState("");
  const [importProvider, setImportProvider] = useState<CloudProvider | "">("");
  const [importWorkloadType, setImportWorkloadType] = useState<WorkloadType | "">("");
  const [importingActuals, setImportingActuals] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setArchitectures(loadSavedArchitectureDrafts());
  }, []);

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
        const [response, actualResponse] = await Promise.all([
          listSavedEstimates(),
          listActualObservations()
        ]);
        if (!active) {
          return;
        }

        setEstimates(response);
        setActuals(actualResponse);
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
  const selectedArchitecture = useMemo(
    () => architectures.find((draft) => draft.id === selectedArchitectureId) ?? null,
    [architectures, selectedArchitectureId]
  );
  const selectedEstimatorRequest = useMemo(
    () => (selectedEstimate ? extractEstimatorRequest(selectedEstimate) : null),
    [selectedEstimate]
  );
  const selectedArchitectScenario = useMemo(
    () => (selectedEstimate ? extractArchitectScenario(selectedEstimate) : null),
    [selectedEstimate]
  );
  const selectedActuals = useMemo(
    () =>
      selectedEstimate
        ? actuals.filter((actual) => actual.estimate_id === selectedEstimate.id)
        : [],
    [actuals, selectedEstimate]
  );
  const showEstimates = savedWorkFilter === "all" || savedWorkFilter === "estimates";
  const showArchitectures = savedWorkFilter === "all" || savedWorkFilter === "architectures";

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

  useEffect(() => {
    if (!selectedArchitectureId && architectures.length) {
      setSelectedArchitectureId(architectures[0].id);
    }
  }, [architectures, selectedArchitectureId]);

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

  function handleOpenInArchitect(
    estimate: SavedEstimateRecord,
    scenario: { request: RecommendationRequest; prompt_override?: string }
  ) {
    storePendingArchitectScenario({
      name: estimate.name,
      request: scenario.request,
      source: "saved_estimate",
      estimate_id: estimate.id,
      prompt_override: scenario.prompt_override,
      imported_at: new Date().toISOString()
    });
    router.push("/architect");
  }

  function handleOpenSavedArchitecture(draft: SavedArchitectureDraft) {
    storeArchitectCanvasDraft(draft);
    router.push("/architect");
  }

  function handleDeleteArchitecture(draftId: string) {
    setDeletingArchitectureId(draftId);
    deleteSavedArchitectureDraft(draftId);
    const nextDrafts = loadSavedArchitectureDrafts();
    setArchitectures(nextDrafts);
    setSelectedArchitectureId((current) => (current === draftId ? nextDrafts[0]?.id ?? null : current));
    setDeletingArchitectureId(null);
  }

  function handleViewDetails(estimateId: number) {
    setSelectedEstimateId(estimateId);

    requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  }

  async function handleSaveActual() {
    if (!selectedEstimate?.provider || !actualCost || !billingPeriodStart || !billingPeriodEnd) {
      setError("Provider, actual cost, and billing period dates are required.");
      return;
    }

    setSavingActual(true);
    setError(null);
    setImportMessage(null);

    try {
      const request = selectedEstimatorRequest ?? selectedArchitectScenario?.request ?? null;
      const record = await createActualObservation({
        estimate_id: selectedEstimate.id,
        provider: selectedEstimate.provider,
        workload_type: request?.workload_type ?? null,
        region: request?.region ?? null,
        billing_period_start: billingPeriodStart,
        billing_period_end: billingPeriodEnd,
        estimated_monthly_cost_usd: selectedEstimate.estimated_monthly_cost_usd ?? null,
        actual_monthly_cost_usd: Number(actualCost),
        notes: actualNotes,
        observed_usage: {}
      });
      setActuals((current) => [record, ...current]);
      setActualCost("");
      setBillingPeriodStart("");
      setBillingPeriodEnd("");
      setActualNotes("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save actual billing record.");
    } finally {
      setSavingActual(false);
    }
  }

  async function handleImportActuals() {
    if (!importPath.trim()) {
      setError("Enter a CSV or JSON billing snapshot path.");
      return;
    }

    setImportingActuals(true);
    setError(null);
    setImportMessage(null);

    try {
      const response = await importBillingSnapshot({
        snapshot_path: importPath.trim(),
        provider: importProvider || undefined,
        estimate_id: selectedEstimate?.id ?? undefined,
        workload_type: importWorkloadType || undefined
      });
      const refreshedActuals = await listActualObservations();
      setActuals(refreshedActuals);
      setImportMessage(
        `Imported ${response.imported_records} billing records from ${response.snapshot_path}.`
      );
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Failed to import billing snapshot.");
    } finally {
      setImportingActuals(false);
    }
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
                  label="Saved Work"
                  sx={{ width: "fit-content", bgcolor: "rgba(12, 107, 88, 0.12)", color: "var(--accent)" }}
                />
                <Typography variant="h2" sx={{ fontSize: { xs: "2.3rem", md: "3.8rem" }, lineHeight: 0.98 }}>
                  Reopen saved estimates and architecture drafts from one place.
                </Typography>
                <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 760 }}>
                  Estimates are saved to your account. Architecture drafts are saved on this device. Use the filter
                  to switch between both kinds of saved work from one workspace.
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {importMessage ? <Alert severity="success">{importMessage}</Alert> : null}

          <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none" }}>
            <CardContent>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "stretch", sm: "center" }} justifyContent="space-between">
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Saved work filter
                </Typography>
                <TextField
                  select
                  value={savedWorkFilter}
                  onChange={(event) => setSavedWorkFilter(event.target.value as SavedWorkFilter)}
                  size="small"
                  sx={{ minWidth: 220 }}
                >
                  <MenuItem value="all">All saved work</MenuItem>
                  <MenuItem value="estimates">Saved estimates</MenuItem>
                  <MenuItem value="architectures">Saved architectures</MenuItem>
                </TextField>
              </Stack>
            </CardContent>
          </Card>

          {!authLoading && !isAuthenticated ? (
            <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
              <CardContent sx={{ p: 4 }}>
                <Stack spacing={2}>
                  <Typography variant="h5">Login Required</Typography>
                  <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 720 }}>
                    Saved estimates are tied to your authenticated account. You can still view saved architecture drafts
                    on this device, but sign in to view, create, or delete estimate records.
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
          ) : isAuthenticated && showEstimates ? (
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
                                variant={estimate.id === selectedEstimateId ? "contained" : "outlined"}
                                onClick={() => handleViewDetails(estimate.id)}
                                sx={
                                  estimate.id === selectedEstimateId
                                    ? {
                                        bgcolor: "var(--accent)",
                                        color: "#ffffff",
                                        "&:hover": { bgcolor: "#265db8" }
                                      }
                                    : { borderColor: "var(--line)", color: "var(--text)" }
                                }
                              >
                                {estimate.id === selectedEstimateId ? "Viewing Details" : "View Details"}
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
                <Card
                  ref={detailPanelRef}
                  tabIndex={-1}
                  sx={{
                    borderRadius: 5,
                    border: "1px solid var(--line)",
                    boxShadow: "none",
                    minHeight: "100%",
                    scrollMarginTop: { xs: 16, md: 32 }
                  }}
                >
                  <CardContent>
                    {selectedEstimate ? (
                      <Stack spacing={2}>
                        <Chip
                          label={`Showing details for estimate #${selectedEstimate.id}`}
                          sx={{ width: "fit-content", bgcolor: "var(--accent-soft)", color: "var(--accent)" }}
                        />
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
                        {selectedEstimatorRequest || selectedArchitectScenario ? (
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                            {selectedEstimatorRequest ? (
                              <Button
                                variant="contained"
                                onClick={() => handleOpenInEstimator(selectedEstimate, selectedEstimatorRequest)}
                                sx={{ alignSelf: "flex-start", bgcolor: "var(--accent)", "&:hover": { bgcolor: "#265db8" } }}
                              >
                                Open In Form Estimator
                              </Button>
                            ) : null}
                            {selectedArchitectScenario ? (
                              <Button
                                variant={selectedEstimatorRequest ? "outlined" : "contained"}
                                onClick={() => handleOpenInArchitect(selectedEstimate, selectedArchitectScenario)}
                                sx={
                                  selectedEstimatorRequest
                                    ? { alignSelf: "flex-start", borderColor: "var(--line)", color: "var(--text)" }
                                    : { alignSelf: "flex-start", bgcolor: "var(--accent)", "&:hover": { bgcolor: "#265db8" } }
                                }
                              >
                                Open In Agent Architect
                              </Button>
                            ) : null}
                          </Stack>
                        ) : (
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            This saved record does not include enough structured data to rebuild an estimator or architect draft.
                          </Typography>
                        )}
                        <Typography variant="h3">
                          {selectedEstimate.estimated_monthly_cost_usd != null
                            ? `$${selectedEstimate.estimated_monthly_cost_usd.toFixed(2)}`
                            : "No monthly total"}
                        </Typography>
                        {selectedEstimate.provider ? (
                          <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                            <CardContent>
                              <Stack spacing={1.5}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                  Record Actual Billing
                                </Typography>
                                <Grid container spacing={2}>
                                  <Grid item xs={12} sm={4}>
                                    <TextField
                                      label="Actual monthly cost"
                                      type="number"
                                      value={actualCost}
                                      onChange={(event) => setActualCost(event.target.value)}
                                      inputProps={{ min: 0, step: "0.01" }}
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid item xs={12} sm={4}>
                                    <TextField
                                      label="Billing start"
                                      type="date"
                                      value={billingPeriodStart}
                                      onChange={(event) => setBillingPeriodStart(event.target.value)}
                                      fullWidth
                                      InputLabelProps={{ shrink: true }}
                                    />
                                  </Grid>
                                  <Grid item xs={12} sm={4}>
                                    <TextField
                                      label="Billing end"
                                      type="date"
                                      value={billingPeriodEnd}
                                      onChange={(event) => setBillingPeriodEnd(event.target.value)}
                                      fullWidth
                                      InputLabelProps={{ shrink: true }}
                                    />
                                  </Grid>
                                </Grid>
                                <TextField
                                  label="Notes"
                                  value={actualNotes}
                                  onChange={(event) => setActualNotes(event.target.value)}
                                  multiline
                                  minRows={2}
                                />
                                <Button
                                  variant="contained"
                                  onClick={handleSaveActual}
                                  disabled={savingActual}
                                  sx={{ alignSelf: "flex-start", bgcolor: "var(--accent)", "&:hover": { bgcolor: "#265db8" } }}
                                >
                                  {savingActual ? "Saving..." : "Save Actual Billing"}
                                </Button>
                                {selectedActuals.length ? (
                                  selectedActuals.map((actual) => (
                                    <Typography key={actual.id} variant="body2" sx={{ color: "var(--muted)" }}>
                                      {actual.billing_period_start} to {actual.billing_period_end}: $
                                      {actual.actual_monthly_cost_usd.toFixed(2)}
                                    </Typography>
                                  ))
                                ) : (
                                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                    No actual billing records linked yet.
                                  </Typography>
                                )}
                              </Stack>
                            </CardContent>
                          </Card>
                        ) : null}
                        <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                          <CardContent>
                            <Stack spacing={1.5}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                Import Billing Snapshot
                              </Typography>
                              <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                Import a local CSV or JSON billing export to create actual cost records automatically.
                              </Typography>
                              <TextField
                                label="Snapshot path"
                                value={importPath}
                                onChange={(event) => setImportPath(event.target.value)}
                                placeholder="C:\\billing\\aws-cur-march.csv"
                                fullWidth
                              />
                              <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                  <TextField
                                    label="Provider override"
                                    value={importProvider}
                                    onChange={(event) => setImportProvider(event.target.value as CloudProvider | "")}
                                    select
                                    fullWidth
                                  >
                                    <MenuItem value="">Auto-detect</MenuItem>
                                    {Array.from(providers).map((provider) => (
                                      <MenuItem key={provider} value={provider}>
                                        {provider.toUpperCase()}
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                  <TextField
                                    label="Workload type"
                                    value={importWorkloadType}
                                    onChange={(event) => setImportWorkloadType(event.target.value as WorkloadType | "")}
                                    select
                                    fullWidth
                                  >
                                    <MenuItem value="">Infer if possible</MenuItem>
                                    {Array.from(workloadTypes).map((workloadType) => (
                                      <MenuItem key={workloadType} value={workloadType}>
                                        {workloadType.replaceAll("_", " ")}
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                </Grid>
                              </Grid>
                              <Button
                                variant="outlined"
                                onClick={handleImportActuals}
                                disabled={importingActuals}
                                sx={{ alignSelf: "flex-start", borderColor: "var(--line)", color: "var(--text)" }}
                              >
                                {importingActuals ? "Importing..." : "Import Billing Snapshot"}
                              </Button>
                            </Stack>
                          </CardContent>
                        </Card>
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

          {showArchitectures ? (
            <Grid container spacing={3}>
              <Grid item xs={12} lg={5}>
                <Stack spacing={2}>
                  {architectures.length ? (
                    architectures.map((draft) => (
                      <Card
                        key={draft.id}
                        sx={{
                          borderRadius: 4,
                          border: "1px solid var(--line)",
                          boxShadow: "none",
                          bgcolor:
                            draft.id === selectedArchitectureId ? "var(--accent-soft)" : "var(--panel-strong)"
                        }}
                      >
                        <CardContent>
                          <Stack spacing={1.2}>
                            <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
                              <Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                  {draft.name}
                                </Typography>
                                <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                  {draft.prompt}
                                </Typography>
                              </Box>
                              <Chip label="Architecture" />
                            </Stack>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                              {draft.selected_providers.map((provider) => (
                                <Chip key={`${draft.id}-${provider}`} label={provider.toUpperCase()} size="small" />
                              ))}
                            </Stack>
                            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                              Saved: {new Date(draft.saved_at).toLocaleString()}
                            </Typography>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                              <Button
                                variant={draft.id === selectedArchitectureId ? "contained" : "outlined"}
                                onClick={() => setSelectedArchitectureId(draft.id)}
                                sx={
                                  draft.id === selectedArchitectureId
                                    ? {
                                        bgcolor: "var(--accent)",
                                        color: "#ffffff",
                                        "&:hover": { bgcolor: "#265db8" }
                                      }
                                    : { borderColor: "var(--line)", color: "var(--text)" }
                                }
                              >
                                {draft.id === selectedArchitectureId ? "Viewing Details" : "View Details"}
                              </Button>
                              <Button
                                color="inherit"
                                onClick={() => handleDeleteArchitecture(draft.id)}
                                disabled={deletingArchitectureId === draft.id}
                              >
                                {deletingArchitectureId === draft.id ? "Deleting..." : "Delete"}
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
                          No architecture drafts are saved yet. Use Save Architecture in Agent Architect to add drafts here.
                        </Typography>
                      </CardContent>
                    </Card>
                  )}
                </Stack>
              </Grid>

              <Grid item xs={12} lg={7}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none", minHeight: "100%" }}>
                  <CardContent>
                    {selectedArchitecture ? (
                      <Stack spacing={2}>
                        <Chip
                          label="Showing saved architecture draft"
                          sx={{ width: "fit-content", bgcolor: "var(--accent-soft)", color: "var(--accent)" }}
                        />
                        <Typography variant="h5">{selectedArchitecture.name}</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Style: {selectedArchitecture.diagram_style ?? "reference"} | Saved:{" "}
                          {new Date(selectedArchitecture.saved_at).toLocaleString()}
                        </Typography>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                          <Button
                            variant="contained"
                            onClick={() => handleOpenSavedArchitecture(selectedArchitecture)}
                            sx={{ alignSelf: "flex-start", bgcolor: "var(--accent)", "&:hover": { bgcolor: "#265db8" } }}
                          >
                            Open In Agent Architect
                          </Button>
                        </Stack>
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
                          {JSON.stringify(selectedArchitecture.plan, null, 2)}
                        </Box>
                      </Stack>
                    ) : (
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Select a saved architecture draft to inspect the stored layout and reopen it in Agent Architect.
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
