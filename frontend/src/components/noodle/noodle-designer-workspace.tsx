"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, Box, Button, Chip, Container, Stack, Typography } from "@mui/material";

import { NoodlePipelineDesigner } from "@/components/noodle/noodle-pipeline-designer";
import { loadNoodlePipelineDraft, loadPendingNoodleDesignerSession, storePendingNoodleSchedulerSession } from "@/lib/scenario-store";
import type {
  NoodleArchitectureOverview,
  NoodleArchitecturePrinciple,
  NoodleDesignerDeployment,
  NoodleOrchestratorPlan,
  NoodlePipelineDesignerDocument,
  NoodlePipelineIntent
} from "@/lib/types";
import type { SavedArchitectureDraft } from "@/lib/scenario-store";

const noodleSecondaryButtonSx = {
  borderRadius: 999,
  px: 2.1,
  minHeight: 44,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  textTransform: "none",
  borderColor: "var(--line)",
  color: "var(--text)",
  bgcolor: "#fff",
  "&:hover": {
    borderColor: "#9db8d8",
    bgcolor: "#f8fbff"
  }
};

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

export function NoodleDesignerWorkspace() {
  const router = useRouter();
  const [intent, setIntent] = useState<NoodlePipelineIntent>(buildEmptyIntent);
  const [workflowTemplate, setWorkflowTemplate] = useState<string | null>(null);
  const [seededFromWorkspace, setSeededFromWorkspace] = useState(false);
  const [architectureOverview, setArchitectureOverview] = useState<NoodleArchitectureOverview | null>(null);
  const [designPrinciples, setDesignPrinciples] = useState<NoodleArchitecturePrinciple[]>([]);
  const [savedArchitecture, setSavedArchitecture] = useState<SavedArchitectureDraft | null>(null);
  const [agentMomoBrief, setAgentMomoBrief] = useState<string | null>(null);
  const [deploymentSeed, setDeploymentSeed] = useState<NoodleDesignerDeployment | null>(null);
  const [seedDocument, setSeedDocument] = useState<NoodlePipelineDesignerDocument | null>(null);
  const [plannedOrchestratorPlan, setPlannedOrchestratorPlan] = useState<NoodleOrchestratorPlan | null>(null);

  useEffect(() => {
    const session = loadPendingNoodleDesignerSession();
    if (!session) {
      return;
    }

    setIntent(session.intent);
    setWorkflowTemplate(session.workflow_template ?? null);
    setArchitectureOverview(session.architecture_overview ?? null);
    setDesignPrinciples(session.design_principles ?? []);
    setSavedArchitecture(session.saved_architecture ?? null);
    setAgentMomoBrief(session.agent_momo_brief ?? null);
    setDeploymentSeed(session.deployment_seed ?? null);
    setSeedDocument(session.pipeline_document ?? null);
    setPlannedOrchestratorPlan(session.orchestrator_plan ?? null);
    setSeededFromWorkspace(true);
  }, []);

  function openSoupSchedulerPage() {
    const currentDraft = typeof window === "undefined" ? null : loadNoodlePipelineDraft();
    storePendingNoodleSchedulerSession({
      source: "designer",
      intent_name: intent.name,
      orchestrator_plan: plannedOrchestratorPlan,
      document: currentDraft ?? seedDocument,
      opened_at: new Date().toISOString()
    });
    router.push("/noodle/scheduler");
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        py: { xs: 2, md: 2.5 },
        background:
          "radial-gradient(circle at top left, rgba(20, 120, 160, 0.18), transparent 22%), radial-gradient(circle at 85% 10%, rgba(24, 78, 160, 0.16), transparent 22%), linear-gradient(180deg, #f8fcff 0%, #eef5fb 100%)"
      }}
    >
      <Container maxWidth={false} disableGutters sx={{ px: { xs: 2, md: 3 } }}>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
            <Stack spacing={1}>
              <Chip label="Noodle Pipeline Designer" sx={{ width: "fit-content", bgcolor: "#dff6ff", color: "#0b5b7f", fontWeight: 800 }} />
              <Typography variant="h2" sx={{ fontSize: { xs: "2.1rem", md: "3rem" }, lineHeight: 1.02 }}>
                Dedicated DAG design workspace.
              </Typography>
              <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 920 }}>
                Build and version pipeline graphs in a separate page, then return to the Noodle workspace for planning and broader platform architecture context.
              </Typography>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button component={Link} href="/noodle" variant="outlined" sx={noodleSecondaryButtonSx}>
                Back To Noodle
              </Button>
              <Button onClick={openSoupSchedulerPage} variant="outlined" sx={noodleSecondaryButtonSx}>
                Soup Scheduler
              </Button>
              <Button component={Link} href="/workspace" variant="outlined" sx={noodleSecondaryButtonSx}>
                Back To Workspace
              </Button>
            </Stack>
          </Stack>

          {seededFromWorkspace ? (
            <Alert severity="info">
              Loaded the current pipeline intent from the Noodle workspace and seeded the designer with that graph.
            </Alert>
          ) : (
            <Alert severity="info">
              No pipeline intent was passed from the Noodle workspace, so the designer opened with the default seed pipeline.
            </Alert>
          )}

          <NoodlePipelineDesigner
            intentName={intent.name}
            sources={intent.sources}
            workflowTemplate={workflowTemplate}
            preferIntentSeed
            architectureOverview={architectureOverview}
            designPrinciples={designPrinciples}
            savedArchitecture={savedArchitecture}
            agentMomoBrief={agentMomoBrief}
            deploymentSeed={deploymentSeed}
            seedDocument={seedDocument}
            plannedOrchestratorPlan={plannedOrchestratorPlan}
          />
        </Stack>
      </Container>
    </Box>
  );
}
