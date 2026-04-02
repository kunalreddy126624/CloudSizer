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
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { useAuth } from "@/components/auth/auth-provider";
import { RoleGuard } from "@/components/auth/role-guard";
import {
  allocateAllocatorRun,
  approveAllocatorRun,
  createAllocatorRun,
  getAllocatorContracts,
  listAllocatorAuditLogs,
  listAllocatorRuns,
  listPendingAllocatorApprovals,
  rejectAllocatorRun,
  validateAllocatorBudget
} from "@/lib/api";
import type {
  AllocationActionRequest,
  AllocatorRunCreateRequest,
  AllocatorRunRecord,
  AvailabilityTier,
  BudgetPreference,
  CloudProvider,
  DeploymentEnvironment,
  PendingApprovalRecord,
  ResourceAllocatorContractResponse,
  ResourceAllocatorRequest,
  WorkloadType
} from "@/lib/types";

const providerOptions: CloudProvider[] = ["aws", "azure", "gcp", "oracle", "alibaba", "ibm", "tencent", "digitalocean", "akamai", "ovhcloud", "cloudflare"];
const workloadOptions: WorkloadType[] = ["application", "web_api", "ecommerce", "erp", "crm", "analytics", "ai_ml", "saas", "dev_test", "vdi"];
const availabilityOptions: AvailabilityTier[] = ["standard", "high", "mission_critical"];
const budgetOptions: BudgetPreference[] = ["lowest_cost", "balanced", "enterprise"];
const environmentOptions: DeploymentEnvironment[] = ["dev", "test", "staging", "prod"];

function titleize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function parseList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseTags(value: string) {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split("=");
        return [key?.trim() ?? "", rest.join("=").trim()];
      })
      .filter(([key, tagValue]) => key && tagValue)
  );
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "--";
}

function buildInitialRequest(): ResourceAllocatorRequest {
  return {
    approved_estimation: {
      approval_reference: "APR-2026-011",
      approved: true,
      baseline_request: {
        workload_type: "application",
        region: "us-east-1",
        user_count: 240,
        concurrent_users: 60,
        storage_gb: 500,
        monthly_requests_million: 3,
        requires_disaster_recovery: true,
        requires_managed_database: true,
        availability_tier: "high",
        budget_preference: "balanced",
        preferred_providers: ["aws", "azure", "gcp"]
      },
      recommended_provider: "aws",
      estimated_monthly_cost_usd: 750,
      approved_services: [],
      notes: ["Approved by architecture review board."]
    },
    budget_constraints: { currency: "USD", max_monthly_cost: 1800 },
    architecture_type: "multi_tier_application",
    organization_context: {
      allowed_clouds: [...providerOptions],
      approved_account_ids: ["aws-shared-prod", "azure-shared-nonprod", "gcp-platform-core"],
      billing_scope: "finops-enterprise",
      account_vending_enabled: true,
      default_parent_org_unit: "platform-core",
      tagging_policy: ["project", "env", "owner"],
      iam_boundary_name: "cloudsizer-boundary",
      private_network_required: false,
      network_guardrails: ["central-logging", "deny-unapproved-egress"],
      terraform_runner_enabled: true,
      terraform_artifact_root: ""
    },
    deployment_request: {
      env: "staging",
      region: "us-east-1",
      owner: "platform-team",
      project: "allocator-dashboard",
      public_ingress_required: false,
      approval_to_apply: false,
      existing_account_id: "",
      requires_new_account: true,
      account_name: "allocator-dashboard-staging",
      account_purpose: "allocator validation environment",
      parent_org_unit: "platform-core",
      additional_tags: { cost_center: "engineering" }
    }
  };
}

export function AllocatorWorkspace() {
  const { hasPermission, hasRole, isAuthenticated, isRbacSession, principal } = useAuth();
  const [request, setRequest] = useState<ResourceAllocatorRequest>(buildInitialRequest);
  const [requester, setRequester] = useState("platform.engineer");
  const [reviewer, setReviewer] = useState("cloud.approver");
  const [budgetReviewer, setBudgetReviewer] = useState("finops.reviewer");
  const [operator, setOperator] = useState("cloud.operator");
  const [changeReason, setChangeReason] = useState("Provision a reviewed multi-cloud workload blueprint.");
  const [approvalComment, setApprovalComment] = useState("Reviewed for provisioning.");
  const [rejectionComment, setRejectionComment] = useState("Rejected for revision.");
  const [budgetComment, setBudgetComment] = useState("Budget reviewed and approved.");
  const [allocationComment, setAllocationComment] = useState("Allocation authorized and staged.");
  const [allowedCloudsText, setAllowedCloudsText] = useState(providerOptions.join(", "));
  const [approvedAccountsText, setApprovedAccountsText] = useState("aws-shared-prod, azure-shared-nonprod, gcp-platform-core");
  const [tagPolicyText, setTagPolicyText] = useState("project, env, owner");
  const [guardrailsText, setGuardrailsText] = useState("central-logging, deny-unapproved-egress");
  const [additionalTagsText, setAdditionalTagsText] = useState("cost_center=engineering");
  const [contracts, setContracts] = useState<ResourceAllocatorContractResponse | null>(null);
  const [runs, setRuns] = useState<AllocatorRunRecord[]>([]);
  const [pending, setPending] = useState<PendingApprovalRecord[]>([]);
  const [logs, setLogs] = useState<Array<{ id: number; run_id?: number | null; actor: string; action: string; created_at: string }>>([]);
  const [selectedRun, setSelectedRun] = useState<AllocatorRunRecord | null>(null);
  const [toolMessages, setToolMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh(preferredRunId?: number) {
    setError(null);
    try {
      const [contractResponse, runResponse, pendingResponse, auditResponse] = await Promise.all([
        getAllocatorContracts(),
        listAllocatorRuns(),
        listPendingAllocatorApprovals(),
        listAllocatorAuditLogs()
      ]);
      setContracts(contractResponse);
      setRuns(runResponse.runs);
      setPending(pendingResponse.approvals);
      setLogs(auditResponse.logs);
      setSelectedRun((current) => {
        const targetId = preferredRunId ?? current?.id;
        if (targetId) {
          const matching = runResponse.runs.find((run) => run.id === targetId);
          if (matching) {
            return matching;
          }
        }
        return runResponse.runs[0] ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load allocator dashboard.");
    }
  }

  function buildRunRequest(): AllocatorRunCreateRequest {
    return {
      requested_by: requester,
      change_reason: changeReason,
      payload: {
        ...request,
        organization_context: {
          ...request.organization_context,
          allowed_clouds: parseList(allowedCloudsText) as CloudProvider[],
          approved_account_ids: parseList(approvedAccountsText),
          tagging_policy: parseList(tagPolicyText),
          network_guardrails: parseList(guardrailsText)
        },
        deployment_request: {
          ...request.deployment_request,
          additional_tags: parseTags(additionalTagsText),
          existing_account_id: request.deployment_request.existing_account_id || undefined
        }
      }
    };
  }

  async function submitRun() {
    setBusy(true);
    setError(null);
    try {
      const response = await createAllocatorRun(buildRunRequest());
      setToolMessages(response.tools.map((tool) => `${tool.name}: ${tool.status} - ${tool.message}`));
      setSelectedRun(response.run);
      await refresh(response.run.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create allocator run.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(runId: number, action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const response = action === "approve"
        ? await approveAllocatorRun(runId, { reviewer: principal?.email ?? reviewer, comment: approvalComment })
        : await rejectAllocatorRun(runId, { reviewer: principal?.email ?? reviewer, comment: rejectionComment });
      setToolMessages(response.tools.map((tool) => `${tool.name}: ${tool.status} - ${tool.message}`));
      setSelectedRun(response.run);
      await refresh(response.run.id);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : `Failed to ${action} allocator run.`);
    } finally {
      setBusy(false);
    }
  }

  async function reviewBudget(runId: number) {
    setBusy(true);
    setError(null);
    try {
      const response = await validateAllocatorBudget(runId, {
        reviewer: principal?.email ?? budgetReviewer,
        comment: budgetComment
      });
      setToolMessages(response.tools.map((tool) => `${tool.name}: ${tool.status} - ${tool.message}`));
      setSelectedRun(response.run);
      await refresh(response.run.id);
    } catch (budgetError) {
      setError(budgetError instanceof Error ? budgetError.message : "Failed to validate allocator budget.");
    } finally {
      setBusy(false);
    }
  }

  async function allocate(runId: number) {
    setBusy(true);
    setError(null);
    try {
      const response = await allocateAllocatorRun(runId, {
        operator: principal?.email ?? operator,
        comment: allocationComment
      } satisfies AllocationActionRequest);
      setToolMessages(response.tools.map((tool) => `${tool.name}: ${tool.status} - ${tool.message}`));
      setSelectedRun(response.run);
      await refresh(response.run.id);
    } catch (allocationError) {
      setError(allocationError instanceof Error ? allocationError.message : "Failed to allocate resources.");
    } finally {
      setBusy(false);
    }
  }

  const canCreate = hasPermission("create_estimation") && hasRole("architect", "admin");
  const canApprove = hasPermission("approve_request") && hasRole("approver", "admin");
  const canReject = hasPermission("reject_request") && hasRole("approver", "admin");
  const canBudgetValidate = hasPermission("view_cost") && hasRole("finops", "admin");
  const canAllocate = hasPermission("allocate_resources") && hasRole("operator", "admin");
  const awaitingBudgetRuns = runs.filter((run) => run.approval_status === "approved" && run.budget_validation_status === "pending");
  const readyToAllocateRuns = runs.filter((run) =>
    run.approval_status === "approved" &&
    run.budget_validation_status === "approved" &&
    run.status !== "completed" &&
    run.status !== "provisioning" &&
    run.status !== "failed"
  );
  const selectedRunReadyForApproval = selectedRun?.approval_status === "pending";
  const selectedRunReadyForBudget = selectedRun?.approval_status === "approved" && selectedRun?.budget_validation_status === "pending";
  const selectedRunReadyForAllocation =
    selectedRun?.approval_status === "approved" &&
    selectedRun?.budget_validation_status === "approved" &&
    selectedRun?.status !== "completed" &&
    selectedRun?.status !== "provisioning" &&
    selectedRun?.status !== "failed";

  return (
    <Box sx={{ py: { xs: 4, md: 6 }, minHeight: "100vh", background: "radial-gradient(circle at top left, rgba(255, 191, 120, 0.24), transparent 24%), radial-gradient(circle at 85% 10%, rgba(38, 93, 184, 0.14), transparent 25%), linear-gradient(180deg, #fbfcff 0%, #eef4ff 100%)" }}>
      <Container maxWidth="xl">
        <Stack spacing={3}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
            <Stack spacing={1}>
              <Chip label="Allocator Control Plane" sx={{ width: "fit-content", bgcolor: "#fff1df", color: "#9a4d00", fontWeight: 800 }} />
              <Typography variant="h2" sx={{ fontSize: { xs: "2.2rem", md: "3rem" }, lineHeight: 1.02 }}>
                Submit, approve, and stage infrastructure across all 11 clouds.
              </Typography>
              <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 900 }}>
                The allocator now persists runs, generates provider-aware Terraform, creates cloud account scopes, and exposes approval plus audit APIs for AWS, Azure, GCP, Oracle, Alibaba, IBM, Tencent, DigitalOcean, Akamai, OVHcloud, and Cloudflare.
              </Typography>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button component={Link} href="/workspace" variant="outlined" sx={{ borderColor: "var(--line)", color: "var(--text)" }}>Back To Workspace</Button>
              <Button onClick={() => void refresh()} variant="outlined" disabled={busy}>Refresh</Button>
              <RoleGuard anyRole={["architect", "admin"]} everyPermission={["create_estimation"]}>
                <Button onClick={submitRun} variant="contained" disabled={busy || !canCreate} sx={{ bgcolor: "var(--accent)", color: "#fff", "&:hover": { bgcolor: "#265db8" } }}>
                  {busy ? "Working..." : "Create Run"}
                </Button>
              </RoleGuard>
            </Stack>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {!isAuthenticated ? (
            <Alert severity="info">
              Sign in with an RBAC-backed account to get role-based controls. View-only access is still available.
            </Alert>
          ) : principal ? (
            <Alert severity="success">
              RBAC session loaded for {principal.email}. Roles: {principal.roles.map(titleize).join(", ")}.
            </Alert>
          ) : (
            <Alert severity="info">
              This session does not include RBAC roles. Actions are hidden and the dashboard is read-only until you sign in with an RBAC JWT.
            </Alert>
          )}

          <Grid container spacing={3}>
            <Grid item xs={12} lg={5}>
              <Stack spacing={3}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Typography variant="h5">Run Inputs</Typography>
                      <TextField label="Requested by" value={requester} onChange={(event) => setRequester(event.target.value)} />
                      <TextField label="Approver identity" value={reviewer} onChange={(event) => setReviewer(event.target.value)} helperText="Used as a fallback label when no RBAC principal is present." />
                      <TextField label="FINOPS identity" value={budgetReviewer} onChange={(event) => setBudgetReviewer(event.target.value)} helperText="Used as a fallback label when no RBAC principal is present." />
                      <TextField label="Operator identity" value={operator} onChange={(event) => setOperator(event.target.value)} helperText="Used as a fallback label when no RBAC principal is present." />
                      <TextField label="Change reason" multiline minRows={2} value={changeReason} onChange={(event) => setChangeReason(event.target.value)} />
                      <TextField label="Approval comment" multiline minRows={2} value={approvalComment} onChange={(event) => setApprovalComment(event.target.value)} />
                      <TextField label="Rejection comment" multiline minRows={2} value={rejectionComment} onChange={(event) => setRejectionComment(event.target.value)} />
                      <TextField label="Budget review comment" multiline minRows={2} value={budgetComment} onChange={(event) => setBudgetComment(event.target.value)} />
                      <TextField label="Allocation comment" multiline minRows={2} value={allocationComment} onChange={(event) => setAllocationComment(event.target.value)} />
                      <TextField select label="Target cloud" value={request.approved_estimation.recommended_provider} onChange={(event) => setRequest((current) => ({ ...current, approved_estimation: { ...current.approved_estimation, recommended_provider: event.target.value as CloudProvider } }))}>
                        {providerOptions.map((option) => <MenuItem key={option} value={option}>{titleize(option)}</MenuItem>)}
                      </TextField>
                      <TextField select label="Workload" value={request.approved_estimation.baseline_request.workload_type} onChange={(event) => setRequest((current) => ({ ...current, approved_estimation: { ...current.approved_estimation, baseline_request: { ...current.approved_estimation.baseline_request, workload_type: event.target.value as WorkloadType } } }))}>
                        {workloadOptions.map((option) => <MenuItem key={option} value={option}>{titleize(option)}</MenuItem>)}
                      </TextField>
                      <TextField select label="Availability" value={request.approved_estimation.baseline_request.availability_tier} onChange={(event) => setRequest((current) => ({ ...current, approved_estimation: { ...current.approved_estimation, baseline_request: { ...current.approved_estimation.baseline_request, availability_tier: event.target.value as AvailabilityTier } } }))}>
                        {availabilityOptions.map((option) => <MenuItem key={option} value={option}>{titleize(option)}</MenuItem>)}
                      </TextField>
                      <TextField select label="Budget profile" value={request.approved_estimation.baseline_request.budget_preference} onChange={(event) => setRequest((current) => ({ ...current, approved_estimation: { ...current.approved_estimation, baseline_request: { ...current.approved_estimation.baseline_request, budget_preference: event.target.value as BudgetPreference } } }))}>
                        {budgetOptions.map((option) => <MenuItem key={option} value={option}>{titleize(option)}</MenuItem>)}
                      </TextField>
                      <TextField select label="Environment" value={request.deployment_request.env} onChange={(event) => setRequest((current) => ({ ...current, deployment_request: { ...current.deployment_request, env: event.target.value as DeploymentEnvironment } }))}>
                        {environmentOptions.map((option) => <MenuItem key={option} value={option}>{titleize(option)}</MenuItem>)}
                      </TextField>
                      <TextField label="Architecture type" value={request.architecture_type} onChange={(event) => setRequest((current) => ({ ...current, architecture_type: event.target.value }))} />
                      <TextField label="Project" value={request.deployment_request.project} onChange={(event) => setRequest((current) => ({ ...current, deployment_request: { ...current.deployment_request, project: event.target.value } }))} />
                      <TextField label="Allowed clouds" value={allowedCloudsText} onChange={(event) => setAllowedCloudsText(event.target.value)} helperText="Comma-separated." />
                      <TextField label="Approved account IDs" value={approvedAccountsText} onChange={(event) => setApprovedAccountsText(event.target.value)} helperText="Comma-separated." />
                      <TextField label="Tagging policy" value={tagPolicyText} onChange={(event) => setTagPolicyText(event.target.value)} helperText="Comma-separated." />
                      <TextField label="Network guardrails" value={guardrailsText} onChange={(event) => setGuardrailsText(event.target.value)} helperText="Comma-separated." />
                      <TextField label="Additional tags" multiline minRows={3} value={additionalTagsText} onChange={(event) => setAdditionalTagsText(event.target.value)} helperText="One key=value pair per line." />
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
                      <Typography variant="h5">Selected Run</Typography>
                      {selectedRun ? (
                        <>
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                            <Chip label={`Run #${selectedRun.id}`} />
                            <Chip label={`Status: ${titleize(selectedRun.status)}`} />
                            <Chip label={`Approval: ${titleize(selectedRun.approval_status)}`} variant="outlined" />
                            <Chip label={`Budget: ${titleize(selectedRun.budget_validation_status)}`} variant="outlined" />
                          </Stack>
                          <Typography variant="body1">{selectedRun.summary}</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            {selectedRun.account_plan ? `${titleize(selectedRun.account_plan.provider)} ${titleize(selectedRun.account_plan.resource_kind)}: ${selectedRun.account_plan.rationale}` : "No account plan yet."}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Cost: {selectedRun.cost_result ? `${selectedRun.cost_result.currency} ${selectedRun.cost_result.estimated_monthly_cost.toFixed(2)}` : "--"}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Budget review: {selectedRun.budget_validated_by ? `${selectedRun.budget_validated_by} on ${formatDate(selectedRun.budget_validated_at)}` : "Not reviewed yet."}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Provisioning: {selectedRun.provisioning_result?.message ?? "Not triggered yet."}
                          </Typography>
                          <Stack spacing={1.5} sx={{ p: 2, borderRadius: 3, bgcolor: "#f8fafc", border: "1px solid var(--line)" }}>
                            <Typography variant="h6">Run Actions</Typography>
                            <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                              Approval is restricted to APPROVER/Admin, budget validation to FINOPS/Admin, and allocation to OPERATOR/Admin.
                            </Typography>
                            <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                              <RoleGuard anyRole={["approver", "admin"]} everyPermission={["approve_request"]}>
                                <Button
                                  variant="contained"
                                  disabled={busy || !selectedRunReadyForApproval || !canApprove}
                                  onClick={() => selectedRun ? void decide(selectedRun.id, "approve") : undefined}
                                  sx={{ bgcolor: "var(--accent)", color: "#fff", "&:hover": { bgcolor: "#265db8" } }}
                                >
                                  Approve
                                </Button>
                              </RoleGuard>
                              <RoleGuard anyRole={["approver", "admin"]} everyPermission={["reject_request"]}>
                                <Button
                                  variant="outlined"
                                  disabled={busy || !selectedRunReadyForApproval || !canReject}
                                  onClick={() => selectedRun ? void decide(selectedRun.id, "reject") : undefined}
                                >
                                  Reject
                                </Button>
                              </RoleGuard>
                              <RoleGuard anyRole={["finops", "admin"]} everyPermission={["view_cost"]}>
                                <Button
                                  variant="contained"
                                  color="warning"
                                  disabled={busy || !selectedRunReadyForBudget || !canBudgetValidate}
                                  onClick={() => selectedRun ? void reviewBudget(selectedRun.id) : undefined}
                                >
                                  Validate Budget
                                </Button>
                              </RoleGuard>
                              <RoleGuard anyRole={["operator", "admin"]} everyPermission={["allocate_resources"]}>
                                <Button
                                  variant="contained"
                                  color="success"
                                  disabled={busy || !selectedRunReadyForAllocation || !canAllocate}
                                  onClick={() => selectedRun ? void allocate(selectedRun.id) : undefined}
                                >
                                  Allocate
                                </Button>
                              </RoleGuard>
                            </Stack>
                            {isRbacSession && !canApprove && !canReject && !canBudgetValidate && !canAllocate ? (
                              <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                This role is read-only for allocator workflow actions.
                              </Typography>
                            ) : null}
                          </Stack>
                          <Box component="pre" sx={{ m: 0, p: 2, borderRadius: 3, bgcolor: "#111827", color: "#e5eefb", overflowX: "auto", fontSize: 12 }}>
                            {JSON.stringify(selectedRun, null, 2)}
                          </Box>
                        </>
                      ) : (
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>Create a run to inspect the generated account scope, Terraform bundle, and approval state.</Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Typography variant="h5">Latest Tool Activity</Typography>
                      {toolMessages.length ? toolMessages.map((message) => (
                        <Typography key={message} variant="body2" sx={{ color: "var(--muted)" }}>{message}</Typography>
                      )) : <Typography variant="body2" sx={{ color: "var(--muted)" }}>No tool activity yet.</Typography>}
                      <Typography variant="h6">Contracts</Typography>
                      {contracts ? contracts.tool_contracts.map((contract) => (
                        <Typography key={contract.name} variant="body2" sx={{ color: "var(--muted)" }}>
                          {contract.name}: {contract.description}
                        </Typography>
                      )) : <Typography variant="body2" sx={{ color: "var(--muted)" }}>Loading contracts...</Typography>}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            <Grid item xs={12} lg={4}>
              <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={1.5}>
                    <Typography variant="h5">Recent Runs</Typography>
                    {runs.map((run) => (
                      <Button key={run.id} onClick={() => setSelectedRun(run)} variant="text" sx={{ justifyContent: "space-between", textTransform: "none" }}>
                        <span>Run #{run.id} - {run.payload.approved_estimation.recommended_provider}</span>
                        <span>{titleize(run.status)}</span>
                      </Button>
                    ))}
                    {!runs.length ? <Typography variant="body2" sx={{ color: "var(--muted)" }}>No allocator runs yet.</Typography> : null}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} lg={4}>
              <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={1.5}>
                    <Typography variant="h5">Pending Approvals</Typography>
                    {pending.map((item) => (
                      <Stack key={item.run_id} direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between">
                        <Typography variant="body2">Run #{item.run_id} - {item.requested_by}</Typography>
                        <Stack direction="row" spacing={1}>
                          <RoleGuard anyRole={["approver", "admin"]} everyPermission={["approve_request"]}>
                            <Button size="small" onClick={() => void decide(item.run_id, "approve")} disabled={busy || !canApprove}>Approve</Button>
                          </RoleGuard>
                          <RoleGuard anyRole={["approver", "admin"]} everyPermission={["reject_request"]}>
                            <Button size="small" onClick={() => void decide(item.run_id, "reject")} disabled={busy || !canReject}>Reject</Button>
                          </RoleGuard>
                        </Stack>
                      </Stack>
                    ))}
                    {!pending.length ? <Typography variant="body2" sx={{ color: "var(--muted)" }}>No runs waiting for approval.</Typography> : null}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} lg={4}>
              <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={1.5}>
                    <Typography variant="h5">Budget And Allocation Queue</Typography>
                    {awaitingBudgetRuns.map((run) => (
                      <Stack key={`budget-${run.id}`} direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between">
                        <Typography variant="body2">Run #{run.id} awaiting FINOPS validation</Typography>
                        <RoleGuard anyRole={["finops", "admin"]} everyPermission={["view_cost"]}>
                          <Button size="small" onClick={() => void reviewBudget(run.id)} disabled={busy || !canBudgetValidate}>Validate Budget</Button>
                        </RoleGuard>
                      </Stack>
                    ))}
                    {readyToAllocateRuns.map((run) => (
                      <Stack key={`allocate-${run.id}`} direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="space-between">
                        <Typography variant="body2">Run #{run.id} ready for allocation</Typography>
                        <RoleGuard anyRole={["operator", "admin"]} everyPermission={["allocate_resources"]}>
                          <Button size="small" onClick={() => void allocate(run.id)} disabled={busy || !canAllocate}>Allocate</Button>
                        </RoleGuard>
                      </Stack>
                    ))}
                    {!awaitingBudgetRuns.length && !readyToAllocateRuns.length ? (
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>No runs are waiting on FINOPS review or operator allocation.</Typography>
                    ) : null}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={1.5}>
                    <Typography variant="h5">Audit Log</Typography>
                    {logs.map((log) => (
                      <Typography key={log.id} variant="body2" sx={{ color: "var(--muted)" }}>
                        {log.action} by {log.actor} {log.run_id ? `for run #${log.run_id}` : ""} on {formatDate(log.created_at)}
                      </Typography>
                    ))}
                    {!logs.length ? <Typography variant="body2" sx={{ color: "var(--muted)" }}>Audit events will appear here.</Typography> : null}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Stack>
      </Container>
    </Box>
  );
}
