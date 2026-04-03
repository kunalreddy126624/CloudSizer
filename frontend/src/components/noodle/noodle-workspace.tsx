"use client";

import { useCallback, useEffect, useState } from "react";
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
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import {
  getNoodleBlueprint,
  getNoodleOverview,
  listNoodleReferenceSpecs,
  planNoodlePipeline
} from "@/lib/api";
import { loadSavedArchitectureDrafts, storePendingNoodleDesignerSession, type SavedArchitectureDraft } from "@/lib/scenario-store";
import type {
  NoodleArchitectureOverview,
  NoodleLatencySlo,
  NoodleOrchestratorPlan,
  NoodleOrchestratorTaskPlan,
  NoodlePipelineIntent,
  NoodleSavedArchitectureContext,
  NoodlePipelinePlanResponse,
  NoodlePlatformBlueprint,
  NoodleReferenceSpec
} from "@/lib/types";

const deploymentScopes: NoodlePipelineIntent["deployment_scope"][] = ["hybrid", "multi_cloud", "edge", "hybrid_multi_cloud"];
const latencyOptions: NoodleLatencySlo[] = ["seconds", "minutes", "hours", "daily"];
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const designPrinciples = blueprint?.design_principles ?? [];
  const selectedArchitecture = savedArchitectures.find((entry) => entry.id === selectedArchitectureId) ?? null;

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
      orchestrator_plan: orchestratorPlan,
      opened_at: new Date().toISOString()
    });
    router.push("/noodle/designer");
  }

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
              <Button onClick={() => void generatePlan()} variant="contained" disabled={busy} sx={noodlePrimaryButtonSx}>
                {busy ? "Planning..." : "Generate Plan"}
              </Button>
            </Stack>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}

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
                      <Typography variant="h5">Generated Plan</Typography>
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
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Agent Momo Brief</Typography>
                              <Typography variant="body2" sx={{ color: "var(--muted)", mt: 1 }}>
                                {plan.agent_momo_brief}
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
                            {JSON.stringify(plan, null, 2)}
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
