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
  Container,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { useAuth } from "@/components/auth/auth-provider";
import { advisorChat, createSavedEstimate } from "@/lib/api";
import { MAX_GUEST_RUNS, loadGuestUsageSummary, recordGuestUsage } from "@/lib/guest-usage";
import { buildRecommendationDetailHref } from "@/lib/query";
import { storePendingEstimatorScenario } from "@/lib/scenario-store";
import { formatWorkloadLabel } from "@/lib/workloads";
import type {
  AdvisorChatMessage,
  CloudProvider,
  RecommendationRequest,
  RecommendationResponse,
  EstimationAdvisorResponse
} from "@/lib/types";

const providerOptions: CloudProvider[] = [
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
];
const quickPrompts = [
  "We need ERP for 800 users in India, PostgreSQL, 2 TB storage, backups, public web access, and disaster recovery in a second region.",
  "We need a CRM platform for 500 sales and support users in UAE with managed database, file attachments, and high availability.",
  "We need an application platform for 200 concurrent users, 300 GB storage, 5 million monthly API requests, and low-cost scaling."
];

const initialAssistantMessage: AdvisorChatMessage = {
  role: "assistant",
  content:
    "Describe the workload you want to estimate. Include users, region, storage, database needs, and whether you need HA or disaster recovery."
};

function formatCurrency(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }

  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function metricCard(label: string, value: string, accent: "primary" | "success" | "cool" = "success") {
  const accentStyles =
    accent === "primary"
      ? { color: "var(--accent)", backgroundColor: "var(--accent-soft)" }
      : accent === "cool"
        ? { color: "#4c84ea", backgroundColor: "var(--accent-cool-soft)" }
        : { color: "var(--success)", backgroundColor: "var(--success-soft)" };

  return (
    <Card
      sx={{
        borderRadius: 4,
        border: "1px solid var(--line)",
        boxShadow: "none",
        bgcolor: "var(--panel-strong)",
        height: "100%"
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Stack spacing={0.9}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              borderRadius: 3,
              px: 1.2,
              py: 0.8,
              width: "fit-content",
              ...accentStyles
            }}
          >
            {value}
          </Typography>
          <Typography variant="body2" sx={{ color: "var(--muted)", whiteSpace: "normal" }}>
            {label}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function AdvisorWorkspace() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [draftMessage, setDraftMessage] = useState(
    "We need ERP for 800 users in India, PostgreSQL, 2 TB storage, backups, public web access, and disaster recovery in a second region."
  );
  const [budget, setBudget] = useState<number | "">(8000);
  const [providers, setProviders] = useState<CloudProvider[]>(providerOptions);
  const [messages, setMessages] = useState<AdvisorChatMessage[]>([initialAssistantMessage]);
  const [conversationSummary, setConversationSummary] = useState("");
  const [estimate, setEstimate] = useState<EstimationAdvisorResponse | null>(null);
  const [inferredRequest, setInferredRequest] = useState<RecommendationRequest | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [guestSummary, setGuestSummary] = useState(loadGuestUsageSummary);

  useEffect(() => {
    setGuestSummary(loadGuestUsageSummary());
  }, [isAuthenticated]);

  useEffect(() => {
    if (!estimate) {
      return;
    }

    const workload = estimate.detected_workload?.replaceAll("_", " ") ?? "workload";
    const provider = estimate.recommended_provider?.toUpperCase() ?? "multi-cloud";
    setSaveName(`Agent estimate for ${workload} on ${provider}`);
  }, [estimate]);

  const topPlan = estimate?.provider_plans[0] ?? null;
  const topRecommendation = recommendation?.recommendations[0] ?? null;
  const monthlyTotal =
    topRecommendation?.estimated_monthly_cost_usd ?? topPlan?.estimated_monthly_cost_usd ?? null;
  const annualTotal = monthlyTotal != null ? monthlyTotal * 12 : null;
  const userMessages = useMemo(
    () => messages.filter((message) => message.role === "user"),
    [messages]
  );
  const annualSpread = useMemo(() => {
    if (!recommendation || recommendation.recommendations.length < 2) {
      return null;
    }

    const lowest = recommendation.recommendations[0].estimated_monthly_cost_usd;
    const highest =
      recommendation.recommendations[recommendation.recommendations.length - 1].estimated_monthly_cost_usd;
    return (highest - lowest) * 12;
  }, [recommendation]);
  const readinessScore = useMemo(() => {
    if (!estimate || !inferredRequest) {
      return null;
    }

    const score =
      68 +
      Math.min(estimate.recommended_service_families.length * 4, 16) +
      Math.min(userMessages.length * 3, 12);
    return Math.min(score, 97);
  }, [estimate, inferredRequest, userMessages.length]);

  function toggleProvider(provider: CloudProvider) {
    setProviders((current) =>
      current.includes(provider)
        ? current.filter((item) => item !== provider)
        : [...current, provider]
    );
  }

  async function handleSendMessage() {
    if (draftMessage.trim().length < 5) {
      setError("Enter a more specific message before sending.");
      return;
    }

    if (!providers.length) {
      setError("Select at least one provider.");
      return;
    }

    if (!isAuthenticated && loadGuestUsageSummary().remaining <= 0) {
      setError(`Guest access is limited to ${MAX_GUEST_RUNS} estimate runs. Sign in to continue.`);
      return;
    }

    const nextUserMessage: AdvisorChatMessage = {
      role: "user",
      content: draftMessage.trim()
    };
    const nextMessages = [...messages, nextUserMessage];

    setMessages(nextMessages);
    setDraftMessage("");
    setLoading(true);
    setError(null);
    setSaveMessage(null);

    try {
      const response = await advisorChat({
        messages: nextMessages,
        preferred_providers: providers,
        monthly_budget_usd: typeof budget === "number" ? budget : null
      });

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.assistant_message
        }
      ]);
      setConversationSummary(response.conversation_summary);
      setEstimate(response.estimate ?? null);
      setInferredRequest(response.inferred_request ?? null);
      setRecommendation(response.recommendation ?? null);
      if (!isAuthenticated) {
        setGuestSummary(recordGuestUsage("advisor"));
      }
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Failed to contact the advisor.");
    } finally {
      setLoading(false);
    }
  }

  function handleResetConversation() {
    setMessages([initialAssistantMessage]);
    setConversationSummary("");
    setEstimate(null);
    setInferredRequest(null);
    setRecommendation(null);
    setDraftMessage("");
    setError(null);
    setSaveMessage(null);
    setSaveName("");
  }

  function handleOpenFormEstimator() {
    if (inferredRequest) {
      const workload = formatWorkloadLabel(inferredRequest.workload_type);
      const providerLabel =
        recommendation?.recommendations[0]?.provider?.toUpperCase() ??
        estimate?.recommended_provider?.toUpperCase() ??
        "MULTI-CLOUD";

      storePendingEstimatorScenario({
        name: `Advisor handoff for ${workload} on ${providerLabel}`,
        request: inferredRequest,
        source: "advisor",
        imported_at: new Date().toISOString()
      });
    }

    router.push("/estimator");
  }

  async function handleSaveEstimate() {
    if (!estimate) {
      return;
    }

    if (!saveName.trim()) {
      setError("Enter a name before saving this estimate.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const record = await createSavedEstimate({
        name: saveName.trim(),
        estimate_type: recommendation ? "workload_recommendation" : "advisor_plan",
        provider:
          recommendation?.recommendations[0]?.provider ??
          estimate.recommended_provider ??
          estimate.provider_plans[0]?.provider ??
          null,
        estimated_monthly_cost_usd:
          recommendation?.recommendations[0]?.estimated_monthly_cost_usd ??
          estimate.provider_plans[0]?.estimated_monthly_cost_usd ??
          null,
        summary: recommendation?.recommendations[0]
          ? `Agent-produced end-to-end estimate for ${formatWorkloadLabel(recommendation.workload_type)} workload.`
          : estimate.summary,
        payload: {
          conversation_summary: conversationSummary,
          messages,
          inferred_request: inferredRequest,
          recommendation,
          estimate
        }
      });
      setSaveMessage(`Saved estimate #${record.id}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save estimate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box
      sx={{
        py: { xs: 4, md: 6 },
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(100, 167, 255, 0.24), transparent 22%), radial-gradient(circle at top right, rgba(49, 111, 214, 0.18), transparent 22%), linear-gradient(180deg, #f9fbff 0%, #edf4ff 100%)"
      }}
    >
      <Container maxWidth="xl">
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", lg: "center" }}
            spacing={2}
          >
            <Stack spacing={1}>
              <Chip
                label="CloudSizer Estimation Agent"
                sx={{
                  width: "fit-content",
                  bgcolor: "var(--accent-soft)",
                  color: "var(--accent)",
                  fontWeight: 700,
                  border: "1px solid var(--line-strong)"
                }}
              />
              <Typography variant="h2" sx={{ fontSize: { xs: "2.2rem", md: "3.4rem" }, lineHeight: 1.02 }}>
                Chat once and get the full estimate, recommendation set, and provider ranking.
              </Typography>
              <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 860 }}>
                This agent now handles the end-to-end estimation flow. It reads the workload, infers the
                planning inputs, runs the recommendation engine, and returns provider comparisons without
                forcing you through the manual estimator first.
              </Typography>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button
                component={Link}
                href="/estimates"
                variant="contained"
                sx={{
                  minWidth: 190,
                  px: 3,
                  py: 1.5,
                  borderRadius: 999,
                  bgcolor: "rgba(20, 52, 102, 0.92)",
                  color: "#ffffff",
                  fontWeight: 800,
                  boxShadow: "0 14px 28px rgba(20, 52, 102, 0.18)",
                  "&:hover": {
                    bgcolor: "#163b73",
                    boxShadow: "0 16px 30px rgba(20, 52, 102, 0.24)"
                  }
                }}
              >
                Saved Estimates
              </Button>
              <Button
                onClick={handleOpenFormEstimator}
                variant="contained"
                sx={{
                  minWidth: 210,
                  px: 3,
                  py: 1.5,
                  borderRadius: 999,
                  bgcolor: "#1f58bf",
                  border: "2px solid #ffffff",
                  color: "#ffffff",
                  fontWeight: 800,
                  boxShadow: "0 16px 32px rgba(31, 88, 191, 0.34), 0 0 0 4px rgba(31, 88, 191, 0.14)",
                  textShadow: "0 1px 1px rgba(0, 0, 0, 0.15)",
                  "&:hover": {
                    bgcolor: "#18479b",
                    boxShadow: "0 18px 34px rgba(31, 88, 191, 0.4), 0 0 0 4px rgba(31, 88, 191, 0.18)"
                  }
                }}
              >
                Open Form Estimator
              </Button>
            </Stack>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {!isAuthenticated ? (
            <Alert severity={guestSummary.remaining > 0 ? "info" : "warning"}>
              Guest access is limited to {MAX_GUEST_RUNS} estimate runs total. You have {guestSummary.remaining}{" "}
              remaining.
            </Alert>
          ) : null}

          <Grid container spacing={3}>
            <Grid item xs={12} lg={5}>
              <Stack spacing={3}>
                <Card
                  sx={{
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    boxShadow: "none",
                    bgcolor: "var(--panel)",
                    backdropFilter: "blur(16px)"
                  }}
                >
                  <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                    <Stack spacing={3}>
                      <Typography variant="h4">Agent Chat</Typography>

                      <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                          <Typography variant="body1" sx={{ color: "var(--muted)" }}>
                            Monthly budget
                          </Typography>
                          <Typography variant="h5" sx={{ color: "var(--accent)" }}>
                            {typeof budget === "number" ? formatCurrency(budget) : "--"}
                          </Typography>
                        </Stack>
                        <TextField
                          label="Budget in USD"
                          type="number"
                          value={budget}
                          onChange={(event) => setBudget(event.target.value ? Number(event.target.value) : "")}
                          inputProps={{ min: 0, step: "100" }}
                        />
                      </Stack>

                      <Stack spacing={1.2}>
                        <Typography variant="body1" sx={{ color: "var(--muted)" }}>
                          Target providers
                        </Typography>
                        <Stack direction="row" spacing={1.2} flexWrap="wrap" useFlexGap>
                          {providerOptions.map((provider) => {
                            const active = providers.includes(provider);
                            return (
                              <Chip
                                key={provider}
                                label={provider.toUpperCase()}
                                onClick={() => toggleProvider(provider)}
                                sx={{
                                  px: 1.2,
                                  fontWeight: 700,
                                  borderRadius: 999,
                                  border: "1px solid",
                                  borderColor: active ? "var(--line-strong)" : "var(--line)",
                                  bgcolor: active ? "var(--accent-soft)" : "transparent",
                                  color: active ? "var(--accent)" : "var(--muted)"
                                }}
                              />
                            );
                          })}
                        </Stack>
                      </Stack>

                      <Card
                        sx={{
                          borderRadius: 5,
                          border: "1px solid var(--line)",
                          boxShadow: "none",
                          bgcolor: "var(--panel-soft)"
                        }}
                      >
                        <CardContent sx={{ p: 2 }}>
                          <Stack spacing={1.4} sx={{ maxHeight: 330, overflowY: "auto", pr: 0.5 }}>
                            {messages.map((message, index) => (
                              <Box
                                key={`${message.role}-${index}`}
                                sx={{
                                  alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                                  width: "fit-content",
                                  maxWidth: "88%",
                                  px: 2,
                                  py: 1.5,
                                  borderRadius: 4,
                                  border: "1px solid",
                                  borderColor:
                                    message.role === "user" ? "var(--line-strong)" : "rgba(49, 111, 214, 0.1)",
                                  bgcolor:
                                    message.role === "user"
                                      ? "rgba(49, 111, 214, 0.08)"
                                      : "rgba(255,255,255,0.72)"
                                }}
                              >
                                <Stack spacing={0.5}>
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: message.role === "user" ? "var(--accent)" : "#4c84ea",
                                      fontWeight: 800,
                                      letterSpacing: "0.04em"
                                    }}
                                  >
                                    {message.role === "user" ? "YOU" : "CLOUDSIZER AGENT"}
                                  </Typography>
                                  <Typography variant="body2" sx={{ color: "var(--text)", whiteSpace: "pre-wrap" }}>
                                    {message.content}
                                  </Typography>
                                </Stack>
                              </Box>
                            ))}
                          </Stack>
                        </CardContent>
                      </Card>

                      <TextField
                        label="Describe the workload"
                        multiline
                        minRows={5}
                        value={draftMessage}
                        onChange={(event) => setDraftMessage(event.target.value)}
                        placeholder="Example: We need ERP for 800 users in India, PostgreSQL, 2 TB storage, public web access, backups, and DR in a second region."
                      />

                      <Stack spacing={1}>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Quick start prompts
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {quickPrompts.map((prompt) => (
                            <Chip
                              key={prompt}
                              label={prompt}
                              onClick={() => setDraftMessage(prompt)}
                              sx={{
                                maxWidth: "100%",
                                bgcolor: "rgba(255,255,255,0.72)",
                                border: "1px solid var(--line)",
                                color: "var(--text)"
                              }}
                            />
                          ))}
                        </Stack>
                      </Stack>

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <Button
                          variant="contained"
                          disabled={loading}
                          onClick={handleSendMessage}
                          sx={{
                            bgcolor: "var(--accent)",
                            color: "#ffffff",
                            px: 3.2,
                            fontWeight: 800,
                            boxShadow: "0 10px 24px rgba(49, 111, 214, 0.22)",
                            "&:hover": { bgcolor: "#265db8" }
                          }}
                        >
                          {loading ? "Estimating..." : "Run End-to-End Estimate"}
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={handleResetConversation}
                          sx={{ borderColor: "var(--line-strong)", color: "var(--text)" }}
                        >
                          Clear Chat
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>

                {estimate ? (
                  <Card
                    sx={{
                      borderRadius: 5,
                      border: "1px solid var(--line)",
                      boxShadow: "none",
                      bgcolor: "rgba(255,255,255,0.84)"
                    }}
                  >
                    <CardContent>
                      <Stack spacing={1.5}>
                        <Typography variant="h6">Save This Agent Estimate</Typography>
                        <TextField
                          label="Estimate name"
                          value={saveName}
                          onChange={(event) => setSaveName(event.target.value)}
                        />
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                          <Button
                            variant="contained"
                            disabled={saving}
                            onClick={handleSaveEstimate}
                            sx={{ bgcolor: "var(--accent)", color: "#ffffff", "&:hover": { bgcolor: "#265db8" } }}
                          >
                            {saving ? "Saving..." : "Save Estimate"}
                          </Button>
                          <Button
                            component={Link}
                            href="/estimates"
                            variant="outlined"
                            sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                          >
                            View Saved Estimates
                          </Button>
                        </Stack>
                        {saveMessage ? <Alert severity="success">{saveMessage}</Alert> : null}
                      </Stack>
                    </CardContent>
                  </Card>
                ) : null}
              </Stack>
            </Grid>

            <Grid item xs={12} lg={7}>
              <Stack spacing={3}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    {metricCard(
                      "Agent readiness",
                      readinessScore != null ? `${readinessScore}%` : "--",
                      "success"
                    )}
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    {metricCard(
                      "Monthly best estimate",
                      monthlyTotal != null ? formatCurrency(monthlyTotal) : "--",
                      "primary"
                    )}
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    {metricCard(
                      "Annual provider spread",
                      annualSpread != null ? formatCurrency(annualSpread) : "--",
                      "cool"
                    )}
                  </Grid>
                </Grid>

                {inferredRequest ? (
                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "rgba(255,255,255,0.84)" }}>
                    <CardContent>
                      <Stack spacing={1.5}>
                        <Typography variant="h5">Inferred Workload Inputs</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          The chat agent converted your conversation into the structured inputs below before
                          running the recommendation engine.
                        </Typography>
                        <Grid container spacing={1.5}>
                          <Grid item xs={6} md={4}>
                            <Chip label={`Workload: ${formatWorkloadLabel(inferredRequest.workload_type)}`} />
                          </Grid>
                          <Grid item xs={6} md={4}>
                            <Chip label={`Region: ${inferredRequest.region}`} />
                          </Grid>
                          <Grid item xs={6} md={4}>
                            <Chip label={`Users: ${inferredRequest.user_count}`} />
                          </Grid>
                          <Grid item xs={6} md={4}>
                            <Chip label={`Concurrent: ${inferredRequest.concurrent_users}`} />
                          </Grid>
                          <Grid item xs={6} md={4}>
                            <Chip label={`Storage: ${inferredRequest.storage_gb} GB`} />
                          </Grid>
                          <Grid item xs={6} md={4}>
                            <Chip label={`Requests: ${inferredRequest.monthly_requests_million}M/mo`} />
                          </Grid>
                          <Grid item xs={12}>
                            <Chip
                              label={`Availability: ${inferredRequest.availability_tier.replaceAll("_", " ")} | Budget: ${inferredRequest.budget_preference.replaceAll("_", " ")} | DR: ${inferredRequest.requires_disaster_recovery ? "Yes" : "No"}`}
                            />
                          </Grid>
                        </Grid>
                      </Stack>
                    </CardContent>
                  </Card>
                ) : null}

                {recommendation ? (
                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "rgba(255,255,255,0.9)" }}>
                    <CardContent>
                      <Stack spacing={2.4}>
                        <Typography variant="h5">End-to-End Recommendation Output</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          These are the full recommendations generated from the inferred workload request.
                        </Typography>
                        {recommendation.recommendations.map((item) => (
                          <Card
                            key={item.provider}
                            sx={{
                              borderRadius: 4,
                              border: "1px solid var(--line)",
                              boxShadow: "none",
                              bgcolor:
                                item.provider === recommendation.recommendations[0]?.provider
                                  ? "rgba(49, 111, 214, 0.08)"
                                  : "var(--panel-strong)"
                            }}
                          >
                            <CardContent>
                              <Stack spacing={1.4}>
                                <Stack
                                  direction={{ xs: "column", sm: "row" }}
                                  justifyContent="space-between"
                                  alignItems={{ xs: "flex-start", sm: "center" }}
                                  spacing={1}
                                >
                                  <Stack spacing={0.4}>
                                    <Typography variant="overline" sx={{ color: "var(--muted)", letterSpacing: "0.12em" }}>
                                      {item.provider.toUpperCase()}
                                    </Typography>
                                    <Typography variant="h6">{item.profile}</Typography>
                                  </Stack>
                                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                    <Chip
                                      label={`Score ${item.score}`}
                                      sx={{ bgcolor: "var(--accent-soft)", color: "var(--accent)" }}
                                    />
                                    {item.accuracy ? (
                                      <Chip
                                        label={`Confidence ${item.accuracy.confidence_score}%`}
                                        sx={{ bgcolor: "rgba(12, 107, 88, 0.12)", color: "var(--success)" }}
                                      />
                                    ) : null}
                                    <Typography variant="h5" sx={{ color: "var(--accent)" }}>
                                      {formatCurrency(item.estimated_monthly_cost_usd)}
                                    </Typography>
                                  </Stack>
                                </Stack>
                                <Typography variant="body2" sx={{ color: "var(--muted)", lineHeight: 1.6 }}>
                                  {item.rationale.join(" ")}
                                </Typography>
                                {item.accuracy ? (
                                  <Typography variant="caption" sx={{ color: "var(--muted)", lineHeight: 1.5 }}>
                                    Actual comparisons: {item.accuracy.compared_actuals_count} | Live pricing coverage:{" "}
                                    {item.accuracy.live_pricing_coverage_percent}%
                                  </Typography>
                                ) : null}
                                <Typography variant="caption" sx={{ color: "var(--muted)", lineHeight: 1.5 }}>
                                  {item.services.map((service) => `${service.name} (${formatCurrency(service.estimated_monthly_cost_usd)})`).join(" | ")}
                                </Typography>
                                {inferredRequest ? (
                                  <Button
                                    component={Link}
                                    href={buildRecommendationDetailHref(inferredRequest, item.provider)}
                                    variant="outlined"
                                    sx={{ alignSelf: "flex-start", borderColor: "var(--line)", color: "var(--text)" }}
                                  >
                                    View Full Detail
                                  </Button>
                                ) : null}
                              </Stack>
                            </CardContent>
                          </Card>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                ) : null}

                {estimate ? (
                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "rgba(255,255,255,0.84)" }}>
                    <CardContent>
                      <Stack spacing={2.2}>
                        <Typography variant="h5">Agent Planning Notes</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)", lineHeight: 1.6 }}>
                          {estimate.summary}
                        </Typography>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={6}>
                            <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-soft)" }}>
                              <CardContent>
                                <Stack spacing={1}>
                                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                    Assumptions
                                  </Typography>
                                  {estimate.assumptions.map((item) => (
                                    <Typography key={item} variant="body2" sx={{ color: "var(--muted)", lineHeight: 1.6 }}>
                                      {item}
                                    </Typography>
                                  ))}
                                </Stack>
                              </CardContent>
                            </Card>
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "var(--panel-soft)" }}>
                              <CardContent>
                                <Stack spacing={1}>
                                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                    Next Validation
                                  </Typography>
                                  {estimate.next_questions.map((item) => (
                                    <Typography key={item} variant="body2" sx={{ color: "var(--muted)", lineHeight: 1.6 }}>
                                      {item}
                                    </Typography>
                                  ))}
                                </Stack>
                              </CardContent>
                            </Card>
                          </Grid>
                        </Grid>
                        <Typography variant="body2" sx={{ color: "var(--muted)", lineHeight: 1.6 }}>
                          Conversation summary: {conversationSummary || "No summary yet"}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                ) : (
                  <Card sx={{ borderRadius: 5, border: "1px dashed var(--line)", boxShadow: "none", minHeight: 260 }}>
                    <CardContent sx={{ p: 4 }}>
                      <Stack spacing={1.5}>
                        <Typography variant="h5">No end-to-end estimate yet</Typography>
                        <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 760 }}>
                          Start with a plain-language workload description. The agent will infer the sizing
                          inputs and generate the recommendation set here.
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
