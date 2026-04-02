"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
import type {
  NoodleArchitectureOverview,
  NoodleLatencySlo,
  NoodlePipelineIntent,
  NoodlePipelinePlanResponse,
  NoodlePlatformBlueprint,
  NoodleReferenceSpec
} from "@/lib/types";

const deploymentScopes: NoodlePipelineIntent["deployment_scope"][] = ["hybrid", "multi_cloud", "edge", "hybrid_multi_cloud"];
const latencyOptions: NoodleLatencySlo[] = ["seconds", "minutes", "hours", "daily"];

function titleize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseItems(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
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

export function NoodleWorkspace() {
  const [overview, setOverview] = useState<NoodleArchitectureOverview | null>(null);
  const [blueprint, setBlueprint] = useState<NoodlePlatformBlueprint | null>(null);
  const [referenceSpecs, setReferenceSpecs] = useState<NoodleReferenceSpec[]>([]);
  const [selectedSpecId, setSelectedSpecId] = useState("");
  const [intent, setIntent] = useState<NoodlePipelineIntent>(buildEmptyIntent);
  const [consumersText, setConsumersText] = useState(intent.target_consumers.join(", "));
  const [plan, setPlan] = useState<NoodlePipelinePlanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadWorkspace();
  }, []);

  async function loadWorkspace() {
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
      if (!selectedSpecId && specsResponse[0]) {
        setSelectedSpecId(specsResponse[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load the Noodle Orchestrator workspace.");
    }
  }

  function applyReferenceSpec(specId: string) {
    setSelectedSpecId(specId);
    const spec = referenceSpecs.find((item) => item.id === specId);
    if (!spec) {
      return;
    }
    setIntent(spec.sample_intent);
    setConsumersText(spec.sample_intent.target_consumers.join(", "));
    setPlan(null);
  }

  async function generatePlan() {
    setBusy(true);
    setError(null);
    try {
      const response = await planNoodlePipeline({
        ...intent,
        target_consumers: parseItems(consumersText)
      });
      setPlan(response);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "Failed to generate the pipeline plan.");
    } finally {
      setBusy(false);
    }
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
              <Button component={Link} href="/workspace" variant="outlined" sx={{ borderColor: "var(--line)", color: "var(--text)" }}>
                Back To Workspace
              </Button>
              <Button onClick={() => void loadWorkspace()} variant="outlined" disabled={busy}>
                Refresh
              </Button>
              <Button onClick={() => void generatePlan()} variant="contained" disabled={busy} sx={{ bgcolor: "var(--accent)", color: "#fff", "&:hover": { bgcolor: "#265db8" } }}>
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
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                        <Button variant={intent.requires_realtime_serving ? "contained" : "outlined"} onClick={() => setIntent((current) => ({ ...current, requires_realtime_serving: !current.requires_realtime_serving }))}>
                          Real-Time Serving
                        </Button>
                        <Button variant={intent.requires_ml_features ? "contained" : "outlined"} onClick={() => setIntent((current) => ({ ...current, requires_ml_features: !current.requires_ml_features }))}>
                          ML Features
                        </Button>
                        <Button variant={intent.contains_sensitive_data ? "contained" : "outlined"} onClick={() => setIntent((current) => ({ ...current, contains_sensitive_data: !current.contains_sensitive_data }))}>
                          Sensitive Data
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={1.5}>
                      <Typography variant="h5">Reference Specs</Typography>
                      {referenceSpecs.map((spec) => (
                        <Box key={spec.id} sx={{ p: 2, borderRadius: 3, border: "1px solid var(--line)", bgcolor: spec.id === selectedSpecId ? "#f1f7ff" : "#fff" }}>
                          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                            <Box>
                              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{spec.name}</Typography>
                              <Typography variant="body2" sx={{ color: "var(--muted)" }}>{spec.summary}</Typography>
                            </Box>
                            <Button size="small" onClick={() => applyReferenceSpec(spec.id)}>Load</Button>
                          </Stack>
                        </Box>
                      ))}
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
                      <Typography variant="h5">Architecture Overview</Typography>
                      {overview ? (
                        <>
                          <Typography variant="body1">{overview.objective}</Typography>
                          <Box component="pre" sx={{ m: 0, p: 2, borderRadius: 3, bgcolor: "#0f172a", color: "#e2ebfb", overflowX: "auto", fontSize: 12 }}>
                            {overview.textual_diagram}
                          </Box>
                          <Grid container spacing={2}>
                            {overview.core_capabilities.map((capability) => (
                              <Grid item xs={12} md={6} key={capability}>
                                <Chip label={capability} sx={{ width: "100%", justifyContent: "flex-start", bgcolor: "#eef6ff" }} />
                              </Grid>
                            ))}
                          </Grid>
                        </>
                      ) : (
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>Loading architecture overview...</Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Typography variant="h5">Platform Blueprint</Typography>
                      {blueprint ? (
                        <Grid container spacing={2}>
                          {[
                            { label: "Orchestration", items: blueprint.orchestration_stack },
                            { label: "Metadata", items: blueprint.metadata_stack },
                            { label: "Governance", items: blueprint.governance_stack },
                            { label: "AI", items: blueprint.ai_stack },
                            { label: "Observability", items: blueprint.observability_stack }
                          ].map((section) => (
                            <Grid item xs={12} md={6} key={section.label}>
                              <Box sx={{ p: 2, borderRadius: 3, border: "1px solid var(--line)", bgcolor: "#fff" }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{section.label}</Typography>
                                <Typography variant="body2" sx={{ color: "var(--muted)", mt: 1 }}>
                                  {section.items.join(", ")}
                                </Typography>
                              </Box>
                            </Grid>
                          ))}
                        </Grid>
                      ) : (
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>Loading blueprint...</Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Typography variant="h5">Generated Plan</Typography>
                      {plan ? (
                        <>
                          <Chip label={`Workflow template: ${plan.workflow_template}`} sx={{ width: "fit-content", bgcolor: "#eef6ff", color: "#1c4f95" }} />
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
