"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
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
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";

import {
  getNoodleBlueprint,
  getNoodleOverview,
  listNoodleReferenceSpecs,
  planNoodlePipeline
} from "@/lib/api";
import {
  loadNoodlePipelineDraft,
  loadSavedArchitectureDrafts,
  storePendingNoodleDesignerSession,
  storePendingNoodleSchedulerSession,
  type SavedArchitectureDraft
} from "@/lib/scenario-store";
import { copyTextToClipboard } from "@/lib/clipboard";
import type {
  NoodleArchitectureOverview,
  NoodleChangePattern,
  NoodleDesignerDeployment,
  NoodleLatencySlo,
  NoodleOrchestratorPlan,
  NoodleOrchestratorTaskPlan,
  NoodleSourceEnvironment,
  NoodleSourceKind,
  NoodleSourceSystem,
  NoodlePipelineIntent,
  NoodleSavedArchitectureContext,
  NoodlePipelinePlanResponse,
  NoodlePlatformBlueprint,
  NoodleReferenceSpec
} from "@/lib/types";

const deploymentScopes: NoodlePipelineIntent["deployment_scope"][] = ["hybrid", "multi_cloud", "edge", "hybrid_multi_cloud"];
const latencyOptions: NoodleLatencySlo[] = ["seconds", "minutes", "hours", "daily"];
const sourceKindOptions: NoodleSourceKind[] = ["api", "database", "stream", "file", "iot", "saas", "github"];
const sourceEnvironmentOptions: NoodleSourceEnvironment[] = ["on_prem", "aws", "azure", "gcp", "edge", "saas"];
const changePatternOptions: NoodleChangePattern[] = ["append", "cdc", "event", "snapshot"];
const noodleButtonSx = {
  borderRadius: 999,
  px: 2.1,
  minHeight: 44,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  textTransform: "none"
};
const noodleSecondaryButtonSx = {
  ...noodleButtonSx,
  borderColor: "var(--line)",
  color: "var(--text)",
  bgcolor: "#fff",
  "&:hover": {
    borderColor: "#9db8d8",
    bgcolor: "#f8fbff"
  }
};
const noodlePrimaryButtonSx = {
  ...noodleButtonSx,
  bgcolor: "var(--accent)",
  color: "#fff",
  boxShadow: "0 10px 24px rgba(38, 93, 184, 0.18)",
  "&:hover": {
    bgcolor: "#265db8"
  }
};

function titleize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseItems(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSourceDraft(kind: NoodleSourceKind = "api"): NoodleSourceSystem {
  if (kind === "github") {
    return {
      name: "github_events",
      kind: "github",
      environment: "saas",
      format_hint: "github webhooks and graphql objects",
      change_pattern: "event"
    };
  }

  return {
    name: `source_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    environment: kind === "saas" ? "saas" : kind === "iot" ? "edge" : "aws",
    format_hint: kind === "database" ? "postgres tables" : kind === "stream" ? "json events" : "json payloads",
    change_pattern: kind === "database" ? "cdc" : kind === "stream" || kind === "iot" ? "event" : "append"
  };
}

function normalizeSourceByKind(source: NoodleSourceSystem, kind: NoodleSourceKind): NoodleSourceSystem {
  if (kind === "github") {
    return {
      ...source,
      kind,
      environment: "saas",
      format_hint: "github webhooks and graphql objects",
      change_pattern: "event"
    };
  }

  if (kind === "saas") {
    return {
      ...source,
      kind,
      environment: source.environment === "saas" ? source.environment : "saas"
    };
  }

  return {
    ...source,
    kind,
    environment: source.environment === "saas" ? "aws" : source.environment
  };
}

function buildEmptyIntent(): NoodlePipelineIntent {
  return {
    name: "edge-operations-control-plane",
    business_goal: "Build a trusted real-time operational intelligence pipeline across edge telemetry and enterprise systems.",
    deployment_scope: "hybrid_multi_cloud",
    latency_slo: "seconds",
    requires_ml_features: true,
    requires_realtime_serving: true,
    contains_sensitive_data: true,
    target_consumers: ["bi", "ops_api", "anomaly_model"],
    sources: [
      {
        name: "edge_sensors",
        kind: "iot",
        environment: "edge",
        format_hint: "protobuf telemetry",
        change_pattern: "event"
      },
      {
        name: "erp_work_orders",
        kind: "database",
        environment: "on_prem",
        format_hint: "oracle relational",
        change_pattern: "cdc"
      }
    ]
  };
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function buildArchitectureContext(architecture: SavedArchitectureDraft | null): NoodleSavedArchitectureContext | null {
  if (!architecture) {
    return null;
  }

  const plan = architecture.plan as Record<string, unknown>;
  return {
    name: architecture.name,
    prompt: architecture.prompt,
    selected_providers: architecture.selected_providers,
    diagram_style: architecture.diagram_style ?? null,
    summary: typeof plan.summary === "string" ? plan.summary : "",
    assumptions: readStringArray(plan.assumptions),
    components: readStringArray(plan.components),
    cloud_services: readStringArray(plan.cloudServices),
    data_flow: readStringArray(plan.dataFlow),
    scaling_strategy: readStringArray(plan.scalingStrategy),
    security_considerations: readStringArray(plan.securityConsiderations),
    saved_at: architecture.saved_at
  };
}

function buildGitHubDeploymentSeed(intentName: string): NoodleDesignerDeployment {
  return {
    enabled: false,
    deploy_target: "local_docker",
    repository: {
      provider: "github",
      connection_id: null,
      repository: `your-org/${intentName}`,
      branch: "main",
      backend_path: "app",
      workflow_ref: ".github/workflows/deploy.yml"
    },
    build_command: "docker build -t noodle-pipeline-backend .",
    deploy_command: "docker compose up -d --build",
    artifact_name: `${intentName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-backend`,
    notes: "Use GitHub as the repository for backend pipeline code and deployment automation."
  };
}

function sanitizePlanForUi(plan: NoodlePipelinePlanResponse) {
  const { agent_momo_brief: _agentMomoBrief, ...visiblePlan } = plan;
  return visiblePlan;
}

export function NoodleWorkspace() {
  const router = useRouter();
  const [overview, setOverview] = useState<NoodleArchitectureOverview | null>(null);
  const [blueprint, setBlueprint] = useState<NoodlePlatformBlueprint | null>(null);
  const [referenceSpecs, setReferenceSpecs] = useState<NoodleReferenceSpec[]>([]);
  const [savedArchitectures, setSavedArchitectures] = useState<SavedArchitectureDraft[]>([]);
  const [selectedArchitectureId, setSelectedArchitectureId] = useState("");
  const [selectedSpecId, setSelectedSpecId] = useState("");
  const [intent, setIntent] = useState<NoodlePipelineIntent>(buildEmptyIntent);
  const [consumersText, setConsumersText] = useState(intent.target_consumers.join(", "));
  const [plan, setPlan] = useState<NoodlePipelinePlanResponse | null>(null);
  const [orchestratorPlan, setOrchestratorPlan] = useState<NoodleOrchestratorPlan | null>(null);
  const [deploymentSeed, setDeploymentSeed] = useState<NoodleDesignerDeployment>(() =>
    buildGitHubDeploymentSeed(buildEmptyIntent().name)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<{ severity: "success" | "warning"; message: string } | null>(null);
  const designPrinciples = blueprint?.design_principles ?? [];
  const selectedArchitecture = savedArchitectures.find((entry) => entry.id === selectedArchitectureId) ?? null;
  const visiblePlan = plan ? sanitizePlanForUi(plan) : null;

  const loadWorkspace = useCallback(async () => {
    setError(null);
    try {
      const [overviewResponse, blueprintResponse, specsResponse] = await Promise.all([
        getNoodleOverview(),
        getNoodleBlueprint(),
        listNoodleReferenceSpecs()
      ]);
      setOverview(overviewResponse);
      setBlueprint(blueprintResponse);
      setReferenceSpecs(specsResponse);
      const architectures = typeof window === "undefined" ? [] : loadSavedArchitectureDrafts();
      setSavedArchitectures(architectures);
      if (!selectedArchitectureId && architectures[0]) {
        setSelectedArchitectureId(architectures[0].id);
      }
      if (!selectedSpecId && specsResponse[0]) {
        setSelectedSpecId(specsResponse[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load the Noodle Orchestrator workspace.");
    }
  }, [selectedArchitectureId, selectedSpecId]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  function applyReferenceSpec(specId: string) {
    setSelectedSpecId(specId);
    const spec = referenceSpecs.find((item) => item.id === specId);
    if (!spec) {
      return;
    }
    setIntent(spec.sample_intent);
    setDeploymentSeed(buildGitHubDeploymentSeed(spec.sample_intent.name));
    setConsumersText(spec.sample_intent.target_consumers.join(", "));
    setPlan(null);
    setOrchestratorPlan(null);
  }

  async function generatePlan() {
    setBusy(true);
    setError(null);
    try {
      const response = await planNoodlePipeline({
        intent: {
          ...intent,
          target_consumers: parseItems(consumersText)
        },
        architecture_context: buildArchitectureContext(selectedArchitecture),
        architecture_overview: overview,
        practice_principles: designPrinciples
      });
      setPlan(response);
      setOrchestratorPlan(response.orchestrator_plan);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "Failed to generate the pipeline plan.");
    } finally {
      setBusy(false);
    }
  }

  function openDesignerPage() {
    storePendingNoodleDesignerSession({
      intent,
      workflow_template: plan?.workflow_template ?? null,
      architecture_overview: overview,
      design_principles: designPrinciples,
      saved_architecture: selectedArchitecture,
      agent_momo_brief: plan?.agent_momo_brief ?? null,
      deployment_seed: deploymentSeed,
      orchestrator_plan: orchestratorPlan,
      opened_at: new Date().toISOString()
    });
    router.push("/noodle/designer");
  }

  function openSoupSchedulerPage() {
    const currentDraft = typeof window === "undefined" ? null : loadNoodlePipelineDraft();
    storePendingNoodleSchedulerSession({
      source: "orchestrator",
      intent_name: intent.name,
      orchestrator_plan: orchestratorPlan,
      document: currentDraft,
      opened_at: new Date().toISOString()
    });
    router.push("/noodle/scheduler");
  }

  const copyPlanJson = useCallback(async () => {
    if (!plan) {
      setCopyNotice({
        severity: "warning",
        message: "Generate a plan first, then copy the JSON."
      });
      return;
    }

    const copied = await copyTextToClipboard(JSON.stringify(sanitizePlanForUi(plan), null, 2));
    setCopyNotice({
      severity: copied ? "success" : "warning",
      message: copied ? "Generated plan JSON copied." : "Clipboard copy failed in this environment."
    });
  }, [plan]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        py: { xs: 4, md: 6 },
        background:
          "radial-gradient(circle at top left, rgba(20, 120, 160, 0.18), transparent 22%), radial-gradient(circle at 85% 10%, rgba(24, 78, 160, 0.16), transparent 22%), linear-gradient(180deg, #f8fcff 0%, #eef5fb 100%)"
      }}
    >
      <Container maxWidth="xl">
        <Stack spacing={3}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
            <Stack spacing={1}>
              <Chip label="Noodle Orchestrator" sx={{ width: "fit-content", bgcolor: "#dff6ff", color: "#0b5b7f", fontWeight: 800 }} />
              <Typography variant="h2" sx={{ fontSize: { xs: "2.1rem", md: "3rem" }, lineHeight: 1.02 }}>
                AI-driven data orchestration across hybrid, multi-cloud, and edge.
              </Typography>
              <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 920 }}>
                Design unified lakehouse pipelines, map the control-plane stack, and generate orchestration-ready plans for operational intelligence, analytics, and AI.
              </Typography>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button component={Link} href="/workspace" variant="outlined" sx={noodleSecondaryButtonSx}>
                Back To Workspace
              </Button>
              <Button onClick={() => void loadWorkspace()} variant="outlined" disabled={busy} sx={noodleSecondaryButtonSx}>
                Refresh
              </Button>
              <Button onClick={openSoupSchedulerPage} variant="outlined" sx={noodleSecondaryButtonSx}>
                Soup Scheduler
              </Button>
              <Button onClick={() => void generatePlan()} variant="contained" disabled={busy} sx={noodlePrimaryButtonSx}>
                {busy ? "Planning..." : "Generate Plan"}
              </Button>
            </Stack>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {copyNotice ? <Alert severity={copyNotice.severity}>{copyNotice.message}</Alert> : null}

          <Grid container spacing={3}>
            <Grid item xs={12} lg={5}>
              <Stack spacing={3}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Typography variant="h5">Pipeline Intent</Typography>
                      <TextField
                        select
                        label="Reference spec"
                        value={selectedSpecId}
                        onChange={(event) => applyReferenceSpec(event.target.value)}
                        helperText="Load a sample intent, then adjust it before planning."
                      >
                        {referenceSpecs.map((spec) => (
                          <MenuItem key={spec.id} value={spec.id}>
                            {spec.name}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField label="Pipeline name" value={intent.name} onChange={(event) => setIntent((current) => ({ ...current, name: event.target.value }))} />
                      <TextField
                        label="Business goal"
                        multiline
                        minRows={3}
                        value={intent.business_goal}
                        onChange={(event) => setIntent((current) => ({ ...current, business_goal: event.target.value }))}
                      />
                      <TextField select label="Deployment scope" value={intent.deployment_scope} onChange={(event) => setIntent((current) => ({ ...current, deployment_scope: event.target.value as NoodlePipelineIntent["deployment_scope"] }))}>
                        {deploymentScopes.map((scope) => (
                          <MenuItem key={scope} value={scope}>
                            {titleize(scope)}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField select label="Latency target" value={intent.latency_slo} onChange={(event) => setIntent((current) => ({ ...current, latency_slo: event.target.value as NoodleLatencySlo }))}>
                        {latencyOptions.map((option) => (
                          <MenuItem key={option} value={option}>
                            {titleize(option)}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        label="Target consumers"
                        value={consumersText}
                        onChange={(event) => setConsumersText(event.target.value)}
                        helperText="Comma-separated consumers like bi, ops_api, anomaly_model."
                      />
                      <Divider />
                      <Stack spacing={1.5}>
                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Backend Repository</Typography>
                            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                              Seed the designer with a GitHub-backed deployment contract for the pipeline backend code.
                            </Typography>
                          </Box>
                          <Chip
                            label={deploymentSeed.enabled ? "GitHub deploy enabled" : "GitHub deploy optional"}
                            color={deploymentSeed.enabled ? "primary" : "default"}
                            variant={deploymentSeed.enabled ? "filled" : "outlined"}
                          />
                        </Stack>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={7}>
                            <TextField
                              fullWidth
                              label="GitHub Repository"
                              value={deploymentSeed.repository.repository}
                              onChange={(event) =>
                                setDeploymentSeed((current) => ({
                                  ...current,
                                  repository: {
                                    ...current.repository,
                                    repository: event.target.value
                                  }
                                }))
                              }
                              helperText="Use owner/repo."
                            />
                          </Grid>
                          <Grid item xs={12} md={5}>
                            <TextField
                              fullWidth
                              label="Branch"
                              value={deploymentSeed.repository.branch}
                              onChange={(event) =>
                                setDeploymentSeed((current) => ({
                                  ...current,
                                  repository: {
                                    ...current.repository,
                                    branch: event.target.value
                                  }
                                }))
                              }
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              label="Backend Path"
                              value={deploymentSeed.repository.backend_path}
                              onChange={(event) =>
                                setDeploymentSeed((current) => ({
                                  ...current,
                                  repository: {
                                    ...current.repository,
                                    backend_path: event.target.value
                                  }
                                }))
                              }
                            />
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <TextField
                              fullWidth
                              select
                              label="Deploy Target"
                              value={deploymentSeed.deploy_target}
                              onChange={(event) =>
                                setDeploymentSeed((current) => ({
                                  ...current,
                                  deploy_target: event.target.value as NoodleDesignerDeployment["deploy_target"]
                                }))
                              }
                            >
                              <MenuItem value="local_docker">local_docker</MenuItem>
                              <MenuItem value="kubernetes">kubernetes</MenuItem>
                              <MenuItem value="airflow_worker">airflow_worker</MenuItem>
                              <MenuItem value="worker_runtime">worker_runtime</MenuItem>
                              <MenuItem value="custom">custom</MenuItem>
                            </TextField>
                          </Grid>
                          <Grid item xs={12}>
                            <TextField
                              fullWidth
                              label="Workflow Ref"
                              value={deploymentSeed.repository.workflow_ref}
                              onChange={(event) =>
                                setDeploymentSeed((current) => ({
                                  ...current,
                                  repository: {
                                    ...current.repository,
                                    workflow_ref: event.target.value
                                  }
                                }))
                              }
                            />
                          </Grid>
                        </Grid>
                      </Stack>
                      <Divider />
                      <Stack spacing={1.5}>
                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Source Systems</Typography>
                            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                              Model every upstream system explicitly. GitHub is available here as a first-class source kind and will seed the designer with a GitHub connection.
                            </Typography>
                          </Box>
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                            <Button
                              variant="outlined"
                              sx={noodleSecondaryButtonSx}
                              onClick={() =>
                                setIntent((current) => ({
                                  ...current,
                                  sources: [...current.sources, buildSourceDraft("github")]
                                }))
                              }
                            >
                              Add GitHub Source
                            </Button>
                            <Button
                              variant="outlined"
                              sx={noodleSecondaryButtonSx}
                              onClick={() =>
                                setIntent((current) => ({
                                  ...current,
                                  sources: [...current.sources, buildSourceDraft()]
                                }))
                              }
                            >
                              Add Source
                            </Button>
                          </Stack>
                        </Stack>
                        {intent.sources.map((source, index) => (
                          <Box key={`${source.name}-${index}`} sx={{ p: 2, borderRadius: 3, border: "1px solid var(--line)", bgcolor: "#f8fbff" }}>
                            <Stack spacing={1.5}>
                              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                  Source {index + 1}
                                </Typography>
                                {intent.sources.length > 1 ? (
                                  <Button
                                    color="error"
                                    onClick={() =>
                                      setIntent((current) => ({
                                        ...current,
                                        sources: current.sources.filter((_, sourceIndex) => sourceIndex !== index)
                                      }))
                                    }
                                  >
                                    Remove
                                  </Button>
                                ) : null}
                              </Stack>
                              <Grid container spacing={2}>
                                <Grid item xs={12} md={6}>
                                  <TextField
                                    fullWidth
                                    label="Source Name"
                                    value={source.name}
                                    onChange={(event) =>
                                      setIntent((current) => ({
                                        ...current,
                                        sources: current.sources.map((item, sourceIndex) =>
                                          sourceIndex === index ? { ...item, name: event.target.value } : item
                                        )
                                      }))
                                    }
                                  />
                                </Grid>
                                <Grid item xs={12} md={6}>
                                  <TextField
                                    select
                                    fullWidth
                                    label="Source Kind"
                                    value={source.kind}
                                    onChange={(event) =>
                                      setIntent((current) => ({
                                        ...current,
                                        sources: current.sources.map((item, sourceIndex) =>
                                          sourceIndex === index
                                            ? normalizeSourceByKind(item, event.target.value as NoodleSourceKind)
                                            : item
                                        )
                                      }))
                                    }
                                    helperText={
                                      source.kind === "github"
                                        ? "GitHub sources are modeled as SaaS event and metadata feeds."
                                        : "Choose the connector family the planner should map to."
                                    }
                                  >
                                    {sourceKindOptions.map((option) => (
                                      <MenuItem key={option} value={option}>
                                        {titleize(option)}
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                  <TextField
                                    select
                                    fullWidth
                                    label="Environment"
                                    value={source.environment}
                                    onChange={(event) =>
                                      setIntent((current) => ({
                                        ...current,
                                        sources: current.sources.map((item, sourceIndex) =>
                                          sourceIndex === index
                                            ? { ...item, environment: event.target.value as NoodleSourceEnvironment }
                                            : item
                                        )
                                      }))
                                    }
                                    disabled={source.kind === "github"}
                                  >
                                    {sourceEnvironmentOptions.map((option) => (
                                      <MenuItem key={option} value={option}>
                                        {titleize(option)}
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                  <TextField
                                    select
                                    fullWidth
                                    label="Change Pattern"
                                    value={source.change_pattern}
                                    onChange={(event) =>
                                      setIntent((current) => ({
                                        ...current,
                                        sources: current.sources.map((item, sourceIndex) =>
                                          sourceIndex === index
                                            ? { ...item, change_pattern: event.target.value as NoodleChangePattern }
                                            : item
                                        )
                                      }))
                                    }
                                    disabled={source.kind === "github"}
                                  >
                                    {changePatternOptions.map((option) => (
                                      <MenuItem key={option} value={option}>
                                        {titleize(option)}
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                </Grid>
                                <Grid item xs={12}>
                                  <TextField
                                    fullWidth
                                    label="Format Hint"
                                    value={source.format_hint}
                                    onChange={(event) =>
                                      setIntent((current) => ({
                                        ...current,
                                        sources: current.sources.map((item, sourceIndex) =>
                                          sourceIndex === index ? { ...item, format_hint: event.target.value } : item
                                        )
                                      }))
                                    }
                                    helperText={
                                      source.kind === "github"
                                        ? "Use this to describe the GitHub API shape you want to ingest, for example webhooks, commits, pull requests, or issues."
                                        : "Use a short source descriptor like protobuf telemetry, postgres tables, or json events."
                                    }
                                  />
                                </Grid>
                              </Grid>
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                      <TextField
                        select
                        label="Saved architecture"
                        value={selectedArchitectureId}
                        onChange={(event) => setSelectedArchitectureId(event.target.value)}
                        helperText={
                          savedArchitectures.length
                            ? "Use a saved architecture draft as the planning anchor for orchestration decisions and Agent Momo context."
                            : "Save an architecture from Agent Architect to use it as a planning anchor here."
                        }
                      >
                        <MenuItem value="">Platform blueprint only</MenuItem>
                        {savedArchitectures.map((draft) => (
                          <MenuItem key={draft.id} value={draft.id}>
                            {draft.name}
                          </MenuItem>
                        ))}
                      </TextField>
                      {selectedArchitecture ? (
                        <Box sx={{ p: 2, borderRadius: 3, border: "1px solid var(--line)", bgcolor: "#f8fbff" }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{selectedArchitecture.name}</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)", mt: 0.6 }}>
                            {String((selectedArchitecture.plan as Record<string, unknown>).summary ?? "Saved architecture context will be passed into planning and Agent Momo.")}
                          </Typography>
                        </Box>
                      ) : null}
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Button variant={intent.requires_realtime_serving ? "contained" : "outlined"} onClick={() => setIntent((current) => ({ ...current, requires_realtime_serving: !current.requires_realtime_serving }))} sx={intent.requires_realtime_serving ? noodlePrimaryButtonSx : noodleSecondaryButtonSx}>
                          Real-Time Serving
                        </Button>
                        <Button variant={intent.requires_ml_features ? "contained" : "outlined"} onClick={() => setIntent((current) => ({ ...current, requires_ml_features: !current.requires_ml_features }))} sx={intent.requires_ml_features ? noodlePrimaryButtonSx : noodleSecondaryButtonSx}>
                          ML Features
                        </Button>
                        <Button variant={intent.contains_sensitive_data ? "contained" : "outlined"} onClick={() => setIntent((current) => ({ ...current, contains_sensitive_data: !current.contains_sensitive_data }))} sx={intent.contains_sensitive_data ? noodlePrimaryButtonSx : noodleSecondaryButtonSx}>
                          Sensitive Data
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={1.5}>
                      <Typography variant="h5">Pipeline Designer</Typography>
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Open the dedicated Airflow-friendly DAG builder with the current pipeline intent, sources, and generated workflow template.
                      </Typography>
                      <Box sx={{ p: 2.25, borderRadius: 3, border: "1px solid var(--line)", bgcolor: "#f8fbff" }}>
                        <Stack spacing={1.5}>
                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            <Chip label={intent.name} sx={{ bgcolor: "#eef6ff" }} />
                            <Chip label={`${intent.sources.length} sources`} sx={{ bgcolor: "#eef6ff" }} />
                            {plan?.workflow_template ? (
                              <Chip label={`Template: ${plan.workflow_template}`} sx={{ bgcolor: "#f1f5f9" }} />
                            ) : null}
                          </Stack>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Use the designer page for graph editing, runs, and execution logs. Keep this page focused on plan generation and handing context into the designer.
                          </Typography>
                          <Button
                            variant="contained"
                            onClick={openDesignerPage}
                            sx={{ ...noodlePrimaryButtonSx, alignSelf: "flex-start" }}
                          >
                            Open Designer Page
                          </Button>
                        </Stack>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>

            <Grid item xs={12} lg={7}>
              <Stack spacing={3}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                        <Typography variant="h5">Generated Plan</Typography>
                        <Tooltip title="Copy generated plan JSON">
                          <span>
                            <IconButton size="small" onClick={() => void copyPlanJson()} disabled={!plan} aria-label="Copy generated plan JSON">
                              <ContentCopyRoundedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                      {plan ? (
                        <>
                          <Chip label={`Workflow template: ${plan.workflow_template}`} sx={{ width: "fit-content", bgcolor: "#eef6ff", color: "#1c4f95" }} />
                          {plan.architecture_context_name ? (
                            <Chip label={`Architecture: ${plan.architecture_context_name}`} sx={{ width: "fit-content", bgcolor: "#f8fbff", color: "#0b5b7f" }} />
                          ) : null}
                          {orchestratorPlan ? (
                            <Box sx={{ p: 2, borderRadius: 3, border: "1px solid var(--line)", bgcolor: "#f8fbff" }}>
                              <Stack spacing={1.5}>
                                <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.5}>
                                  <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Orchestrator Plan</Typography>
                                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                      Create and refine the control-plane task plan here, then open the designer with the same plan context.
                                    </Typography>
                                  </Box>
                                  <Button
                                    variant="outlined"
                                    sx={noodleSecondaryButtonSx}
                                    onClick={() =>
                                      setOrchestratorPlan((current) =>
                                        current
                                          ? {
                                              ...current,
                                              tasks: [
                                                ...current.tasks,
                                                {
                                                  id: createId("task-plan"),
                                                  name: `Task ${current.tasks.length + 1}`,
                                                  stage: "custom-stage",
                                                  plugin: "custom-plugin",
                                                  execution_plane: "worker",
                                                  depends_on: [],
                                                  outputs: [],
                                                  notes: "Manual orchestrator task."
                                                }
                                              ]
                                            }
                                          : current
                                      )
                                    }
                                  >
                                    Add Task
                                  </Button>
                                </Stack>
                                <TextField
                                  label="Plan Objective"
                                  value={orchestratorPlan.objective}
                                  onChange={(event) =>
                                    setOrchestratorPlan((current) => (current ? { ...current, objective: event.target.value } : current))
                                  }
                                />
                                <Grid container spacing={2}>
                                  <Grid item xs={12} md={6}>
                                    <TextField
                                      fullWidth
                                      label="Execution Target"
                                      value={orchestratorPlan.execution_target}
                                      onChange={(event) =>
                                        setOrchestratorPlan((current) =>
                                          current ? { ...current, execution_target: event.target.value } : current
                                        )
                                      }
                                    />
                                  </Grid>
                                  <Grid item xs={12} md={6}>
                                    <TextField
                                      select
                                      fullWidth
                                      label="Trigger"
                                      value={orchestratorPlan.trigger}
                                      onChange={(event) =>
                                        setOrchestratorPlan((current) =>
                                          current
                                            ? {
                                                ...current,
                                                trigger: event.target.value as NoodleOrchestratorPlan["trigger"]
                                              }
                                            : current
                                        )
                                      }
                                    >
                                      <MenuItem value="manual">manual</MenuItem>
                                      <MenuItem value="schedule">schedule</MenuItem>
                                      <MenuItem value="event">event</MenuItem>
                                    </TextField>
                                  </Grid>
                                </Grid>
                                <Stack spacing={1.5}>
                                  {orchestratorPlan.tasks.map((task, index) => (
                                    <Box key={task.id} sx={{ p: 1.5, borderRadius: 3, border: "1px solid var(--line)", bgcolor: "#fff" }}>
                                      <Stack spacing={1.25}>
                                        <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            Task {index + 1}
                                          </Typography>
                                          <Button
                                            color="error"
                                            onClick={() =>
                                              setOrchestratorPlan((current) =>
                                                current
                                                  ? {
                                                      ...current,
                                                      tasks: current.tasks.filter((entry) => entry.id !== task.id)
                                                    }
                                                  : current
                                              )
                                            }
                                          >
                                            Remove
                                          </Button>
                                        </Stack>
                                        <TextField
                                          label="Task Name"
                                          value={task.name}
                                          onChange={(event) =>
                                            setOrchestratorPlan((current) =>
                                              current
                                                ? {
                                                    ...current,
                                                    tasks: current.tasks.map((entry) =>
                                                      entry.id === task.id ? { ...entry, name: event.target.value } : entry
                                                    )
                                                  }
                                                : current
                                            )
                                          }
                                        />
                                        <Grid container spacing={2}>
                                          <Grid item xs={12} md={4}>
                                            <TextField
                                              fullWidth
                                              label="Stage"
                                              value={task.stage}
                                              onChange={(event) =>
                                                setOrchestratorPlan((current) =>
                                                  current
                                                    ? {
                                                        ...current,
                                                        tasks: current.tasks.map((entry) =>
                                                          entry.id === task.id ? { ...entry, stage: event.target.value } : entry
                                                        )
                                                      }
                                                    : current
                                                )
                                              }
                                            />
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <TextField
                                              fullWidth
                                              label="Plugin"
                                              value={task.plugin}
                                              onChange={(event) =>
                                                setOrchestratorPlan((current) =>
                                                  current
                                                    ? {
                                                        ...current,
                                                        tasks: current.tasks.map((entry) =>
                                                          entry.id === task.id ? { ...entry, plugin: event.target.value } : entry
                                                        )
                                                      }
                                                    : current
                                                )
                                              }
                                            />
                                          </Grid>
                                          <Grid item xs={12} md={4}>
                                            <TextField
                                              select
                                              fullWidth
                                              label="Execution Plane"
                                              value={task.execution_plane}
                                              onChange={(event) =>
                                                setOrchestratorPlan((current) =>
                                                  current
                                                    ? {
                                                        ...current,
                                                        tasks: current.tasks.map((entry) =>
                                                          entry.id === task.id
                                                            ? {
                                                                ...entry,
                                                                execution_plane:
                                                                  event.target.value as NoodleOrchestratorTaskPlan["execution_plane"]
                                                              }
                                                            : entry
                                                        )
                                                      }
                                                    : current
                                                )
                                              }
                                            >
                                              <MenuItem value="control_plane">control_plane</MenuItem>
                                              <MenuItem value="airflow">airflow</MenuItem>
                                              <MenuItem value="worker">worker</MenuItem>
                                              <MenuItem value="quality">quality</MenuItem>
                                              <MenuItem value="serving">serving</MenuItem>
                                            </TextField>
                                          </Grid>
                                        </Grid>
                                        <TextField
                                          label="Dependencies"
                                          value={task.depends_on.join(", ")}
                                          onChange={(event) =>
                                            setOrchestratorPlan((current) =>
                                              current
                                                ? {
                                                    ...current,
                                                    tasks: current.tasks.map((entry) =>
                                                      entry.id === task.id
                                                        ? {
                                                            ...entry,
                                                            depends_on: event.target.value.split(",").map((value) => value.trim()).filter(Boolean)
                                                          }
                                                        : entry
                                                    )
                                                  }
                                                : current
                                            )
                                          }
                                          helperText="Comma-separated task ids."
                                        />
                                        <TextField
                                          label="Outputs"
                                          value={task.outputs.join(", ")}
                                          onChange={(event) =>
                                            setOrchestratorPlan((current) =>
                                              current
                                                ? {
                                                    ...current,
                                                    tasks: current.tasks.map((entry) =>
                                                      entry.id === task.id
                                                        ? {
                                                            ...entry,
                                                            outputs: event.target.value.split(",").map((value) => value.trim()).filter(Boolean)
                                                          }
                                                        : entry
                                                    )
                                                  }
                                                : current
                                            )
                                          }
                                          helperText="Comma-separated zones or produced artifacts."
                                        />
                                        <TextField
                                          label="Notes"
                                          multiline
                                          minRows={2}
                                          value={task.notes}
                                          onChange={(event) =>
                                            setOrchestratorPlan((current) =>
                                              current
                                                ? {
                                                    ...current,
                                                    tasks: current.tasks.map((entry) =>
                                                      entry.id === task.id ? { ...entry, notes: event.target.value } : entry
                                                    )
                                                  }
                                                : current
                                            )
                                          }
                                        />
                                      </Stack>
                                    </Box>
                                  ))}
                                </Stack>
                              </Stack>
                            </Box>
                          ) : null}
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Connectors</Typography>
                              {plan.connectors.map((connector) => (
                                <Box key={connector.source_name} sx={{ mt: 1.2 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{connector.source_name}</Typography>
                                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                    {connector.connector_type} via {titleize(connector.ingestion_mode)} into {connector.landing_zone}.
                                  </Typography>
                                </Box>
                              ))}
                            </Grid>
                            <Grid item xs={12} md={6}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Processing</Typography>
                              {plan.processing_stages.map((stage) => (
                                <Box key={stage.name} sx={{ mt: 1.2 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{titleize(stage.name)}</Typography>
                                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                    {stage.engine} {titleize(stage.mode)}: {stage.purpose}
                                  </Typography>
                                </Box>
                              ))}
                            </Grid>
                          </Grid>
                          <Divider />
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Architecture Alignment</Typography>
                              {plan.architecture_alignment.map((item) => (
                                <Typography key={`${item.area}-${item.guidance}`} variant="body2" sx={{ color: "var(--muted)", mt: 1 }}>
                                  <strong>{item.area}:</strong> {item.guidance}
                                </Typography>
                              ))}
                            </Grid>
                            <Grid item xs={12} md={6}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Workflow Template</Typography>
                              <Typography variant="body2" sx={{ color: "var(--muted)", mt: 1 }}>
                                {titleize(plan.workflow_template)} with control-plane scheduling and execution-plane handoff.
                              </Typography>
                            </Grid>
                          </Grid>
                          <Divider />
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Governance</Typography>
                              {plan.governance_controls.map((control) => (
                                <Typography key={control.name} variant="body2" sx={{ color: "var(--muted)", mt: 1 }}>
                                  {titleize(control.name)}: {control.rationale}
                                </Typography>
                              ))}
                            </Grid>
                            <Grid item xs={12} md={6}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>AI Capabilities</Typography>
                              {plan.ai_capabilities.map((capability) => (
                                <Typography key={capability.name} variant="body2" sx={{ color: "var(--muted)", mt: 1 }}>
                                  {titleize(capability.name)}: {capability.function}
                                </Typography>
                              ))}
                            </Grid>
                          </Grid>
                          <Box component="pre" sx={{ m: 0, p: 2, borderRadius: 3, bgcolor: "#111827", color: "#e5eefb", overflowX: "auto", fontSize: 12 }}>
                            {JSON.stringify(visiblePlan, null, 2)}
                          </Box>
                        </>
                      ) : (
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Generate a pipeline plan to see connector selection, processing stages, governance controls, and workflow template choices.
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}
