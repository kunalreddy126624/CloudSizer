"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useAuth } from "@/components/auth/auth-provider";
import { getProviders, getRecommendations } from "@/lib/api";
import { DEFAULT_REQUEST, optionSets } from "@/lib/defaults";
import { MAX_GUEST_RUNS, loadGuestUsageSummary, recordGuestUsage } from "@/lib/guest-usage";
import { buildRecommendationDetailHref } from "@/lib/query";
import {
  clearPendingEstimatorScenario,
  loadPendingEstimatorScenario,
  loadComparisonHistory,
  loadSavedScenarios,
  storePendingArchitectScenario,
  storeComparisonHistory,
  storeSavedScenarios,
  type ComparisonHistoryEntry,
  type SavedScenario
} from "@/lib/scenario-store";
import {
  type ArchitectureRecommendation,
  type CloudProvider,
  type ProviderSummary,
  type RecommendationRequest,
  type RecommendationResponse,
  type SelectiveServicePreference
} from "@/lib/types";
import { formatWorkloadLabel } from "@/lib/workloads";

const decoupledServiceFamilies: Array<{ key: string; label: string }> = [
  { key: "compute", label: "Compute tier" },
  { key: "database", label: "Database tier" },
  { key: "storage", label: "Storage tier" },
  { key: "edge", label: "Edge / network tier" },
  { key: "web_application_firewall", label: "Security edge tier" }
];

function ProviderSummaryCard({ provider }: { provider: ProviderSummary }) {
  return (
    <Card sx={{ height: "100%", borderRadius: 4, boxShadow: "none", border: "1px solid var(--line)" }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack spacing={2}>
          <Chip label={provider.provider.toUpperCase()} sx={{ width: "fit-content", fontWeight: 700 }} />
          <Typography variant="body1" sx={{ color: "var(--muted)", fontSize: "0.98rem", lineHeight: 1.45 }}>
            {provider.strengths.join(" | ")}
          </Typography>
          <Typography variant="caption" sx={{ color: "var(--muted)", lineHeight: 1.45, whiteSpace: "normal" }}>
            Default regions: {provider.default_regions.join(", ")}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function RecommendationCard({
  recommendation,
  detailHref,
  isSelected,
  isRecommended,
  onSelect
}: {
  recommendation: ArchitectureRecommendation;
  detailHref: string;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      sx={{
        borderRadius: 5,
        border: isSelected ? "1px solid var(--line-strong)" : "1px solid var(--line)",
        boxShadow: "none",
        background: isSelected
          ? "linear-gradient(180deg, rgba(236,243,255,0.98), rgba(248,250,245,0.96))"
          : "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,245,0.96))"
      }}
    >
      <CardContent>
        <Stack spacing={2.5}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ letterSpacing: "0.16em", color: "var(--muted)" }}>
                {recommendation.provider.toUpperCase()}
              </Typography>
              <Typography variant="h5">{recommendation.profile}</Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              {isRecommended ? (
                <Chip label="Recommended" sx={{ bgcolor: "rgba(12, 107, 88, 0.12)", color: "var(--success)", fontWeight: 700 }} />
              ) : null}
              {isSelected ? (
                <Chip label="Selected" sx={{ bgcolor: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 }} />
              ) : null}
              <Chip
                label={`Score ${recommendation.score}`}
                sx={{ bgcolor: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 }}
              />
            </Stack>
          </Stack>
          <Typography variant="h3" sx={{ fontSize: { xs: "2rem", md: "2.6rem" } }}>
            ${recommendation.estimated_monthly_cost_usd.toFixed(2)}
          </Typography>
          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
            Estimated monthly cost for the proposed workload profile.
          </Typography>
          <Divider />
          <List disablePadding>
            {recommendation.services.map((service) => (
              <ListItem key={service.name} disableGutters sx={{ py: 1.2 }}>
                <ListItemText
                  primary={service.name}
                  secondary={
                    service.accuracy
                      ? `${service.provider ? `${service.provider.toUpperCase()} | ` : ""}${service.purpose} | ${service.accuracy.confidence_label} confidence ${service.accuracy.confidence_score}%`
                      : `${service.provider ? `${service.provider.toUpperCase()} | ` : ""}${service.purpose}`
                  }
                  primaryTypographyProps={{ fontWeight: 700 }}
                  secondaryTypographyProps={{ color: "var(--muted)" }}
                />
                <Typography variant="body2">${service.estimated_monthly_cost_usd.toFixed(2)}</Typography>
              </ListItem>
            ))}
          </List>
          <Divider />
          <Stack spacing={1}>
            {recommendation.rationale.map((reason) => (
              <Typography key={reason} variant="body2" sx={{ color: "var(--muted)" }}>
                {reason}
              </Typography>
            ))}
          </Stack>
          {recommendation.accuracy ? (
            <>
              <Divider />
              <Stack spacing={1}>
                <Typography variant="subtitle2">
                  Verification: {recommendation.accuracy.confidence_label} confidence ({recommendation.accuracy.confidence_score}%)
                </Typography>
                <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                  Actual comparisons: {recommendation.accuracy.compared_actuals_count} | Live pricing coverage:{" "}
                  {recommendation.accuracy.live_pricing_coverage_percent}%
                </Typography>
                {recommendation.accuracy.mean_absolute_percentage_error != null ? (
                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                    Mean billing error: {recommendation.accuracy.mean_absolute_percentage_error.toFixed(2)}%
                  </Typography>
                ) : null}
                {recommendation.accuracy.caveats.map((caveat) => (
                  <Typography key={caveat} variant="caption" sx={{ color: "var(--muted)" }}>
                    {caveat}
                  </Typography>
                ))}
              </Stack>
            </>
          ) : null}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
            <Button
              variant={isSelected ? "contained" : "outlined"}
              onClick={onSelect}
              sx={
                isSelected
                  ? { alignSelf: "flex-start", bgcolor: "var(--accent)", color: "#ffffff", "&:hover": { bgcolor: "#265db8" } }
                  : { alignSelf: "flex-start", borderColor: "var(--line)", color: "var(--text)" }
              }
            >
              {isSelected ? "Selected Estimate" : "Select Estimate"}
            </Button>
            <Button
              component={Link}
              href={detailHref}
              variant="outlined"
              sx={{ alignSelf: "flex-start", borderColor: "var(--line)", color: "var(--text)" }}
            >
              View Detail
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function CostChart({ recommendations }: { recommendations: ArchitectureRecommendation[] }) {
  const data = recommendations.map((item) => ({
    provider: item.provider.toUpperCase(),
    cost: item.estimated_monthly_cost_usd,
    score: item.score
  }));

  return (
    <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
      <CardContent sx={{ height: 360 }}>
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Typography variant="h6">Monthly Cost Comparison</Typography>
          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
            Compare provider estimates from the latest recommendation run.
          </Typography>
        </Stack>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="provider" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="cost" fill="#0c6b58" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function buildScenarioLabel(request: RecommendationRequest) {
  return `${formatWorkloadLabel(request.workload_type)} | ${request.region}`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function validateRequest(request: RecommendationRequest) {
  if (!request.region.trim()) {
    return "Region is required.";
  }

  if (request.user_count <= 0) {
    return "Users must be greater than 0.";
  }

  if (request.concurrent_users <= 0) {
    return "Concurrent users must be greater than 0.";
  }

  if (request.storage_gb <= 0) {
    return "Storage must be greater than 0 GB.";
  }

  if (request.monthly_requests_million < 0) {
    return "Monthly requests cannot be negative.";
  }

  if (request.preferred_providers.length === 0) {
    return "Select at least one provider.";
  }

  const selectiveServices = request.selective_services ?? [];
  const hasInvalidSelectiveProvider = selectiveServices.some(
    (selection) => !request.preferred_providers.includes(selection.provider)
  );
  if (hasInvalidSelectiveProvider) {
    return "Each selective service provider must be included in preferred providers.";
  }

  return null;
}

export function EstimatorShell() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [request, setRequest] = useState<RecommendationRequest>(DEFAULT_REQUEST);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [selectedRecommendationProvider, setSelectedRecommendationProvider] = useState<CloudProvider | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState("");
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [history, setHistory] = useState<ComparisonHistoryEntry[]>([]);
  const [guestSummary, setGuestSummary] = useState(loadGuestUsageSummary);

  useEffect(() => {
    setGuestSummary(loadGuestUsageSummary());
  }, [isAuthenticated]);

  useEffect(() => {
    let active = true;

    async function loadProviders() {
      try {
        const response = await getProviders();
        if (active) {
          setProviders(response);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load providers.");
        }
      } finally {
        if (active) {
          setLoadingProviders(false);
        }
      }
    }

    loadProviders();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSavedScenarios(loadSavedScenarios());
    setHistory(loadComparisonHistory());

    const pendingScenario = loadPendingEstimatorScenario();
    if (!pendingScenario) {
      return;
    }

    setRequest(pendingScenario.request);
    setScenarioName(pendingScenario.name);
    setResult(null);
    setError(null);
    setImportMessage(
      pendingScenario.source === "advisor"
        ? `Loaded "${pendingScenario.name}" from the estimation agent.`
        : `Loaded "${pendingScenario.name}" from saved estimates.`
    );
    clearPendingEstimatorScenario();
  }, []);

  const chartRecommendations = useMemo(() => result?.recommendations ?? [], [result]);
  const selectedRecommendation = useMemo(
    () =>
      result?.recommendations.find((item) => item.provider === selectedRecommendationProvider) ??
      result?.recommendations[0] ??
      null,
    [result, selectedRecommendationProvider]
  );

  useEffect(() => {
    if (!result?.recommendations.length) {
      setSelectedRecommendationProvider(null);
      return;
    }

    setSelectedRecommendationProvider((current) => {
      if (current && result.recommendations.some((item) => item.provider === current)) {
        return current;
      }

      return result.recommendations[0]?.provider ?? null;
    });
  }, [result]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateRequest(request);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isAuthenticated && loadGuestUsageSummary().remaining <= 0) {
      setError(`Guest access is limited to ${MAX_GUEST_RUNS} estimate runs. Sign in to continue.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await getRecommendations(request);
      setResult(response);

      const topRecommendation = response.recommendations[0];
      const historyEntry: ComparisonHistoryEntry = {
        id: `${Date.now()}`,
        label: buildScenarioLabel(request),
        request,
        top_provider: topRecommendation?.provider ?? "n/a",
        estimated_monthly_cost_usd: topRecommendation?.estimated_monthly_cost_usd ?? 0,
        created_at: new Date().toISOString()
      };

      setHistory((current) => {
        const next = [historyEntry, ...current].slice(0, 6);
        storeComparisonHistory(next);
        return next;
      });
      if (!isAuthenticated) {
        setGuestSummary(recordGuestUsage("estimator"));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to generate recommendations.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateField<Key extends keyof RecommendationRequest>(field: Key, value: RecommendationRequest[Key]) {
    setRequest((current) => ({ ...current, [field]: value }));
  }

  function toggleProvider(provider: CloudProvider) {
    setRequest((current) => {
      const exists = current.preferred_providers.includes(provider);
      const preferredProviders = exists
        ? current.preferred_providers.filter((item) => item !== provider)
        : [...current.preferred_providers, provider];

      return {
        ...current,
        preferred_providers: preferredProviders.length ? preferredProviders : current.preferred_providers
      };
    });
  }

  function getSelectiveProvider(serviceFamily: string): CloudProvider | "" {
    const match = (request.selective_services ?? []).find(
      (selection) => selection.service_family === serviceFamily
    );
    return match?.provider ?? "";
  }

  function updateSelectiveService(serviceFamily: string, provider: CloudProvider | "") {
    setRequest((current) => {
      const existing = current.selective_services ?? [];
      const nextSelections = existing.filter(
        (selection) => selection.service_family !== serviceFamily
      );
      if (provider) {
        const nextEntry: SelectiveServicePreference = {
          service_family: serviceFamily,
          provider,
          required: true
        };
        nextSelections.push(nextEntry);
      }

      const nextPreferredProviders = provider
        ? current.preferred_providers.includes(provider)
          ? current.preferred_providers
          : [...current.preferred_providers, provider]
        : current.preferred_providers;

      return {
        ...current,
        preferred_providers: nextPreferredProviders,
        selective_services: nextSelections
      };
    });
  }

  function saveScenario() {
    const validationError = validateRequest(request);
    if (validationError) {
      setError(validationError);
      return;
    }

    const name = scenarioName.trim() || buildScenarioLabel(request);
    const nextScenario: SavedScenario = {
      id: `${Date.now()}`,
      name,
      request,
      updated_at: new Date().toISOString()
    };

    setSavedScenarios((current) => {
      const deduped = current.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
      const next = [nextScenario, ...deduped].slice(0, 8);
      storeSavedScenarios(next);
      return next;
    });

    setScenarioName(name);
    setError(null);
  }

  function loadScenario(scenario: SavedScenario) {
    setRequest(scenario.request);
    setScenarioName(scenario.name);
    setError(null);
  }

  function deleteScenario(id: string) {
    setSavedScenarios((current) => {
      const next = current.filter((item) => item.id !== id);
      storeSavedScenarios(next);
      return next;
    });
  }

  function handleOpenArchitect() {
    storePendingArchitectScenario({
      name:
        selectedRecommendation?.provider != null
          ? `${scenarioName.trim() || buildScenarioLabel(request)} | ${selectedRecommendation.provider.toUpperCase()}`
          : scenarioName.trim() || buildScenarioLabel(request),
      request,
      source: "estimator",
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
              <Grid container spacing={4} alignItems="center">
                <Grid item xs={12} md={7}>
                  <Stack spacing={2}>
                    <Chip
                      label="Estimator Workspace"
                      sx={{ width: "fit-content", bgcolor: "rgba(12, 107, 88, 0.12)", color: "var(--accent)" }}
                    />
                    <Typography variant="h2" sx={{ fontSize: { xs: "2.4rem", md: "4rem" }, lineHeight: 1.04 }}>
                      Build a multi-cloud plan around the workload, not guesswork.
                    </Typography>
                    <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 700 }}>
                      Capture workload shape, preferred providers, resilience goals, and budget posture.
                      CloudSizer translates those inputs into ranked cloud architecture options.
                    </Typography>
                  </Stack>
                </Grid>
                <Grid item xs={12} md={5}>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Card sx={{ borderRadius: 4, boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                        <CardContent>
                          <Typography variant="overline">Workloads</Typography>
                          <Typography variant="h4">{optionSets.workloadTypes.length}</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            ERP plus specialized workload profiles
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={6}>
                      <Card sx={{ borderRadius: 4, boxShadow: "none", bgcolor: "var(--panel-strong)" }}>
                        <CardContent>
                          <Typography variant="overline">Providers</Typography>
                          <Typography variant="h4">{optionSets.providers.length}</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            AWS, Azure, GCP, and expanded cloud coverage
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Card
            sx={{
              borderRadius: 5,
              border: "1px solid var(--line-strong)",
              boxShadow: "none",
              bgcolor: "rgba(49, 111, 214, 0.08)"
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 3.5 } }}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2.5}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", md: "center" }}
              >
                <Stack spacing={1}>
                  <Chip
                    label="Recommended"
                    sx={{ width: "fit-content", bgcolor: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 }}
                  />
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    Prefer a chat-driven estimate?
                  </Typography>
                  <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 760, lineHeight: 1.6 }}>
                    Use the estimation agent to describe the workload in plain language and get a full recommendation set end to end.
                  </Typography>
                </Stack>
                <Button
                  component={Link}
                  href="/advisor"
                  variant="contained"
                  sx={{
                    minWidth: 240,
                    py: 1.4,
                    bgcolor: "var(--accent)",
                    color: "#ffffff",
                    fontWeight: 800,
                    boxShadow: "0 12px 24px rgba(49, 111, 214, 0.24)",
                    "&:hover": { bgcolor: "#265db8" }
                  }}
                >
                  Open Estimation Agent
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleOpenArchitect}
                  sx={{ minWidth: 240, py: 1.4, borderColor: "var(--line)", color: "var(--text)" }}
                >
                  Open Agent Architect
                </Button>
              </Stack>
            </CardContent>
          </Card>

          {importMessage ? <Alert severity="success">{importMessage}</Alert> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {selectedRecommendation?.accuracy ? (
            <Alert severity={selectedRecommendation.accuracy.confidence_score >= 70 ? "success" : "warning"}>
              Selected estimate confidence is {selectedRecommendation.accuracy.confidence_label} at{" "}
              {selectedRecommendation.accuracy.confidence_score}%. Live pricing coverage is{" "}
              {selectedRecommendation.accuracy.live_pricing_coverage_percent}% and billing backtests cover{" "}
              {selectedRecommendation.accuracy.compared_actuals_count} prior actuals.
            </Alert>
          ) : null}
          {!isAuthenticated ? (
            <Alert severity={guestSummary.remaining > 0 ? "info" : "warning"}>
              Guest access is limited to {MAX_GUEST_RUNS} estimate runs total. You have {guestSummary.remaining}{" "}
              remaining.
            </Alert>
          ) : null}

          <Grid container spacing={3}>
            <Grid item xs={12} lg={4}>
              <Stack spacing={3}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack component="form" spacing={2.5} onSubmit={handleSubmit}>
                      <Box>
                        <Typography variant="h5">Workload Requirements</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)", mt: 0.8 }}>
                          Submit a requirement profile and compare the recommended cloud setup.
                        </Typography>
                      </Box>
                      <FormControl fullWidth>
                        <InputLabel id="workload-type-label">Workload type</InputLabel>
                        <Select
                          labelId="workload-type-label"
                          value={request.workload_type}
                          label="Workload type"
                          onChange={(event) => updateField("workload_type", event.target.value as RecommendationRequest["workload_type"])}
                        >
                          {optionSets.workloadTypes.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        label="Region"
                        value={request.region}
                        onChange={(event) => updateField("region", event.target.value)}
                      />
                      <Grid container spacing={2}>
                        <Grid item xs={6}>
                          <TextField
                            label="Users"
                            type="number"
                            value={request.user_count}
                            onChange={(event) => updateField("user_count", Number(event.target.value))}
                            inputProps={{ min: 1 }}
                            fullWidth
                          />
                        </Grid>
                        <Grid item xs={6}>
                          <TextField
                            label="Concurrent users"
                            type="number"
                            value={request.concurrent_users}
                            onChange={(event) => updateField("concurrent_users", Number(event.target.value))}
                            inputProps={{ min: 1 }}
                            fullWidth
                          />
                        </Grid>
                      </Grid>
                      <Grid container spacing={2}>
                        <Grid item xs={6}>
                          <TextField
                            label="Storage (GB)"
                            type="number"
                            value={request.storage_gb}
                            onChange={(event) => updateField("storage_gb", Number(event.target.value))}
                            inputProps={{ min: 1 }}
                            fullWidth
                          />
                        </Grid>
                        <Grid item xs={6}>
                          <TextField
                            label="Requests (M/month)"
                            type="number"
                            value={request.monthly_requests_million}
                            onChange={(event) => updateField("monthly_requests_million", Number(event.target.value))}
                            inputProps={{ min: 0, step: "0.1" }}
                            fullWidth
                          />
                        </Grid>
                      </Grid>
                      <FormControl fullWidth>
                        <InputLabel id="availability-tier-label">Availability tier</InputLabel>
                        <Select
                          labelId="availability-tier-label"
                          value={request.availability_tier}
                          label="Availability tier"
                          onChange={(event) =>
                            updateField("availability_tier", event.target.value as RecommendationRequest["availability_tier"])
                          }
                        >
                          {optionSets.availabilityTiers.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControl fullWidth>
                        <InputLabel id="budget-preference-label">Budget preference</InputLabel>
                        <Select
                          labelId="budget-preference-label"
                          value={request.budget_preference}
                          label="Budget preference"
                          onChange={(event) =>
                            updateField("budget_preference", event.target.value as RecommendationRequest["budget_preference"])
                          }
                        >
                          {optionSets.budgetPreferences.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                              {option.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Stack spacing={0.5}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5}>
                          <Typography variant="subtitle2">Preferred providers</Typography>
                          <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                            {request.preferred_providers.length} selected
                          </Typography>
                        </Stack>
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))" },
                            gap: 1.2
                          }}
                        >
                          {optionSets.providers.map((provider) => (
                            <Button
                              key={provider}
                              onClick={() => toggleProvider(provider)}
                              variant={request.preferred_providers.includes(provider) ? "contained" : "outlined"}
                              size="small"
                              sx={{
                                minHeight: 44,
                                borderRadius: 3,
                                fontWeight: 800,
                                justifyContent: "center",
                                borderColor: "var(--line)",
                                color: request.preferred_providers.includes(provider) ? "#ffffff" : "var(--text)",
                                bgcolor: request.preferred_providers.includes(provider) ? "var(--accent)" : "transparent",
                                "&:hover": {
                                  borderColor: "var(--line-strong)",
                                  bgcolor: request.preferred_providers.includes(provider)
                                    ? "#265db8"
                                    : "rgba(49, 111, 214, 0.08)"
                                }
                              }}
                            >
                              {provider.toUpperCase()}
                            </Button>
                          ))}
                        </Box>
                      </Stack>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={Boolean(request.enable_decoupled_compute)}
                            onChange={(event) => updateField("enable_decoupled_compute", event.target.checked)}
                          />
                        }
                        label="Enable decoupled compute and cross-cloud service selection"
                      />
                      {request.enable_decoupled_compute ? (
                        <Stack spacing={1.5}>
                          <Typography variant="subtitle2">Selective cloud per service tier</Typography>
                          {decoupledServiceFamilies.map((family) => (
                            <FormControl key={family.key} fullWidth size="small">
                              <InputLabel id={`selective-${family.key}`}>{family.label}</InputLabel>
                              <Select
                                labelId={`selective-${family.key}`}
                                value={getSelectiveProvider(family.key)}
                                label={family.label}
                                onChange={(event) =>
                                  updateSelectiveService(
                                    family.key,
                                    (event.target.value as CloudProvider | "") || ""
                                  )
                                }
                              >
                                <MenuItem value="">Use recommendation default</MenuItem>
                                {request.preferred_providers.map((provider) => (
                                  <MenuItem key={`${family.key}-${provider}`} value={provider}>
                                    {provider.toUpperCase()}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          ))}
                        </Stack>
                      ) : null}
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={request.requires_managed_database}
                            onChange={(event) => updateField("requires_managed_database", event.target.checked)}
                          />
                        }
                        label="Managed database preferred"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={request.requires_disaster_recovery}
                            onChange={(event) => updateField("requires_disaster_recovery", event.target.checked)}
                          />
                        }
                        label="Include disaster recovery overhead"
                      />
                      <TextField
                        label="Scenario name"
                        value={scenarioName}
                        onChange={(event) => setScenarioName(event.target.value)}
                        helperText="Save the current requirement profile for reuse."
                      />
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <Button
                          type="submit"
                          variant="contained"
                          disabled={submitting}
                          sx={{
                            flex: 1,
                            py: 1.4,
                            borderRadius: 3,
                            bgcolor: "var(--accent)",
                            color: "#ffffff",
                            fontWeight: 800,
                            boxShadow: "0 12px 24px rgba(49, 111, 214, 0.24)",
                            "&:hover": { bgcolor: "#265db8" }
                          }}
                        >
                          {submitting ? "Generating..." : "Generate Recommendations"}
                        </Button>
                        <Button
                          type="button"
                          variant="outlined"
                          onClick={saveScenario}
                          sx={{ flex: 1, py: 1.4, borderRadius: 3, borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Save Scenario
                        </Button>
                      </Stack>
                      <Button
                        type="button"
                        variant="text"
                        onClick={handleOpenArchitect}
                        sx={{ alignSelf: "flex-start", px: 0, color: "var(--accent)", fontWeight: 700 }}
                      >
                        Send this requirement to Agent Architect
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Box>
                        <Typography variant="h6">Saved Scenarios</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Reuse named requirement profiles without rebuilding the form.
                        </Typography>
                      </Box>
                      {savedScenarios.length ? (
                        savedScenarios.map((scenario) => (
                          <Card
                            key={scenario.id}
                            sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}
                          >
                            <CardContent sx={{ p: 2 }}>
                              <Stack spacing={1.2}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                  {scenario.name}
                                </Typography>
                                <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                  {formatWorkloadLabel(scenario.request.workload_type)} | {scenario.request.region} | {scenario.request.user_count} users
                                </Typography>
                                <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                  Updated {formatTimestamp(scenario.updated_at)}
                                </Typography>
                                <Stack direction="row" spacing={1}>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => loadScenario(scenario)}
                                    sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                                  >
                                    Load
                                  </Button>
                                  <Button size="small" color="inherit" onClick={() => deleteScenario(scenario.id)}>
                                    Remove
                                  </Button>
                                </Stack>
                              </Stack>
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          No saved scenarios yet. Save a named setup after shaping the requirement form.
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Box>
                        <Typography variant="h6">Recent Comparisons</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Latest recommendation runs and their top-ranked provider.
                        </Typography>
                      </Box>
                      {history.length ? (
                        history.map((entry) => (
                          <Card
                            key={entry.id}
                            sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-strong)" }}
                          >
                            <CardContent sx={{ p: 2 }}>
                              <Stack spacing={0.8}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                  {entry.label}
                                </Typography>
                                <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                  Top provider: {entry.top_provider.toUpperCase()} | ${entry.estimated_monthly_cost_usd.toFixed(2)}
                                </Typography>
                                <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                  {formatTimestamp(entry.created_at)}
                                </Typography>
                              </Stack>
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          No comparison history yet. Generate recommendations to populate this panel.
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>

            <Grid item xs={12} lg={8}>
              <Stack spacing={3}>
                <Grid container spacing={2}>
                  {loadingProviders ? (
                    <Grid item xs={12}>
                      <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                        <CardContent>
                          <Stack direction="row" spacing={1.5} alignItems="center">
                            <CircularProgress size={18} />
                            <Typography variant="body2">Loading provider catalog...</Typography>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  ) : (
                    providers.map((provider) => (
                      <Grid item xs={12} md={4} key={provider.provider}>
                        <ProviderSummaryCard provider={provider} />
                      </Grid>
                    ))
                  )}
                </Grid>

                {result ? (
                  <Grid container spacing={3}>
                    <Grid item xs={12}>
                      <CostChart recommendations={chartRecommendations} />
                    </Grid>
                    {result.recommendations.map((recommendation) => (
                      <Grid item xs={12} key={recommendation.provider}>
                        <RecommendationCard
                          recommendation={recommendation}
                          detailHref={buildRecommendationDetailHref(request, recommendation.provider)}
                          isSelected={recommendation.provider === selectedRecommendationProvider}
                          isRecommended={recommendation.provider === result.recommendations[0]?.provider}
                          onSelect={() => setSelectedRecommendationProvider(recommendation.provider)}
                        />
                      </Grid>
                    ))}
                  </Grid>
                ) : (
                  <Card sx={{ borderRadius: 5, border: "1px dashed var(--line)", boxShadow: "none", minHeight: 300 }}>
                    <CardContent sx={{ p: 4 }}>
                      <Stack spacing={1.5}>
                        <Typography variant="h5">No recommendation generated yet</Typography>
                        <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 720 }}>
                          Start with the default workload profile or tailor the requirement inputs. The dashboard
                          will rank providers, estimate monthly cost, and break the architecture down by service.
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                )}
              </Stack>
            </Grid>
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}
