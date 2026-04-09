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
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import { createNoodlePipelineRun, listNoodlePipelines } from "@/lib/api";
import {
  clearPendingNoodleSchedulerSession,
  loadPendingNoodleSchedulerSession,
  loadSavedNoodlePipelines,
  loadSavedNoodleSchedulerPlans,
  upsertSavedNoodleSchedulerPlan
} from "@/lib/scenario-store";
import type {
  NoodlePipelineDesignerDocument,
  NoodlePipelineRunCreateRequest,
  NoodleSchedulerPlan,
  NoodleSchedulerPlanTask
} from "@/lib/types";

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

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildDefaultPlan(name?: string): NoodleSchedulerPlan {
  return {
    id: createId("soup-plan"),
    name: name?.trim() ? `${name.trim()} soup plan` : "Soup Scheduler plan",
    objective: "Orchestrate multiple pipeline jobs as tasks under one execution plan.",
    tasks: [],
    saved_at: new Date().toISOString()
  };
}

function buildTask(
  pipeline: NoodlePipelineDesignerDocument,
  taskName: string,
  trigger: NoodlePipelineRunCreateRequest["trigger"],
  orchestrationMode: NoodlePipelineRunCreateRequest["orchestration_mode"]
): NoodleSchedulerPlanTask {
  return {
    id: createId("soup-task"),
    task_name: taskName.trim() || `${pipeline.name} task`,
    pipeline_id: pipeline.id,
    pipeline_name: pipeline.name,
    trigger,
    orchestration_mode: orchestrationMode,
    depends_on: [],
    notes: "Assigned from Soup Scheduler."
  };
}

function buildPlanFromPendingSession(
  basePlan: NoodleSchedulerPlan,
  pipelines: NoodlePipelineDesignerDocument[]
): NoodleSchedulerPlan {
  const pending = loadPendingNoodleSchedulerSession();
  if (!pending) {
    return basePlan;
  }

  const fallbackPipeline = pending.document
    ? pipelines.find((entry) => entry.id === pending.document?.id) ?? pending.document
    : pipelines[0];
  const seededTasks = (pending.orchestrator_plan?.tasks ?? []).map<NoodleSchedulerPlanTask>((task, index) => ({
    id: task.id || createId("soup-task"),
    task_name: task.name || `Task ${index + 1}`,
    pipeline_id: fallbackPipeline?.id ?? "",
    pipeline_name: fallbackPipeline?.name ?? "Select pipeline",
    trigger: pending.orchestrator_plan?.trigger ?? "manual",
    orchestration_mode: "plan",
    depends_on: task.depends_on ?? [],
    notes: task.notes || "Imported from orchestrator plan."
  }));

  clearPendingNoodleSchedulerSession();

  if (!seededTasks.length) {
    return {
      ...basePlan,
      name: pending.intent_name?.trim() ? `${pending.intent_name.trim()} soup plan` : basePlan.name
    };
  }

  return {
    ...basePlan,
    name: pending.intent_name?.trim() ? `${pending.intent_name.trim()} soup plan` : basePlan.name,
    objective: pending.orchestrator_plan?.objective || basePlan.objective,
    tasks: seededTasks
  };
}

export function NoodleSchedulerWorkspace() {
  const [pipelines, setPipelines] = useState<NoodlePipelineDesignerDocument[]>([]);
  const [plan, setPlan] = useState<NoodleSchedulerPlan>(buildDefaultPlan);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskTrigger, setTaskTrigger] = useState<NoodlePipelineRunCreateRequest["trigger"]>("manual");
  const [taskOrchestrationMode, setTaskOrchestrationMode] = useState<NoodlePipelineRunCreateRequest["orchestration_mode"]>("plan");
  const [busy, setBusy] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      setBusy(true);
      setError(null);
      try {
        const savedPlans = loadSavedNoodleSchedulerPlans();
        const savedPlan = savedPlans[0] ?? buildDefaultPlan();
        let pipelineList = await listNoodlePipelines();
        if (!pipelineList.length) {
          pipelineList = loadSavedNoodlePipelines();
        }
        if (!active) {
          return;
        }
        const pending = loadPendingNoodleSchedulerSession();
        if (pending?.document && !pipelineList.some((entry) => entry.id === pending.document?.id)) {
          pipelineList = [pending.document, ...pipelineList];
        }
        setPipelines(pipelineList);
        setSelectedPipelineId(pipelineList[0]?.id ?? "");
        setPlan(buildPlanFromPendingSession(savedPlan, pipelineList));
      } catch (loadError) {
        const fallback = loadSavedNoodlePipelines();
        if (!active) {
          return;
        }
        setPipelines(fallback);
        setSelectedPipelineId(fallback[0]?.id ?? "");
        setPlan(buildPlanFromPendingSession(buildDefaultPlan(), fallback));
        setError(loadError instanceof Error ? loadError.message : "Failed to load pipelines for Soup Scheduler.");
      } finally {
        if (active) {
          setBusy(false);
        }
      }
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, []);

  const selectedPipeline = useMemo(
    () => pipelines.find((entry) => entry.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId]
  );

  function savePlan() {
    const next = { ...plan, saved_at: new Date().toISOString() };
    setPlan(next);
    upsertSavedNoodleSchedulerPlan(next);
    setNotice("Soup Scheduler plan saved.");
  }

  function addTask() {
    if (!selectedPipeline) {
      setError("Select a pipeline before adding a task.");
      return;
    }
    setError(null);
    setPlan((current) => ({
      ...current,
      tasks: [...current.tasks, buildTask(selectedPipeline, taskName, taskTrigger, taskOrchestrationMode)]
    }));
    setTaskName("");
  }

  function updateTask(taskId: string, updater: (task: NoodleSchedulerPlanTask) => NoodleSchedulerPlanTask) {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? updater(task) : task))
    }));
  }

  async function dispatchPlan() {
    if (!plan.tasks.length) {
      setError("Add at least one task before dispatching the plan.");
      return;
    }

    setDispatching(true);
    setError(null);

    let successCount = 0;
    let failureCount = 0;
    const nextTasks = [...plan.tasks];

    for (let index = 0; index < nextTasks.length; index += 1) {
      const task = nextTasks[index];
      if (!task.pipeline_id) {
        failureCount += 1;
        nextTasks[index] = { ...task, last_status: "failed", notes: `${task.notes} Missing pipeline assignment.` };
        continue;
      }
      try {
        const response = await createNoodlePipelineRun(task.pipeline_id, {
          trigger: task.trigger,
          orchestration_mode: task.orchestration_mode
        });
        successCount += 1;
        nextTasks[index] = {
          ...task,
          last_run_id: response.run.id,
          last_status: response.run.status
        };
      } catch {
        failureCount += 1;
        nextTasks[index] = {
          ...task,
          last_status: "failed",
          notes: `${task.notes} Dispatch failed; verify pipeline and run API availability.`
        };
      }
    }

    const nextPlan = { ...plan, tasks: nextTasks, saved_at: new Date().toISOString() };
    setPlan(nextPlan);
    upsertSavedNoodleSchedulerPlan(nextPlan);
    setDispatching(false);
    setNotice(`Soup Scheduler dispatched: ${successCount} succeeded, ${failureCount} failed.`);
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
              <Chip label="Soup Scheduler" sx={{ width: "fit-content", bgcolor: "#dff6ff", color: "#0b5b7f", fontWeight: 800 }} />
              <Typography variant="h2" sx={{ fontSize: { xs: "2.1rem", md: "3rem" }, lineHeight: 1.02 }}>
                Coordinate pipeline jobs under one plan.
              </Typography>
              <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 920 }}>
                Build a single multi-pipeline execution plan, assign each job as a task, and dispatch runs from one control page.
              </Typography>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <Button component={Link} href="/noodle" variant="outlined" sx={noodleSecondaryButtonSx}>
                Back To Noodle
              </Button>
              <Button component={Link} href="/noodle/designer" variant="outlined" sx={noodleSecondaryButtonSx}>
                Back To Designer
              </Button>
            </Stack>
          </Stack>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {notice ? <Alert severity="success">{notice}</Alert> : null}

          <Grid container spacing={3}>
            <Grid item xs={12} lg={5}>
              <Stack spacing={3}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Typography variant="h5">Plan</Typography>
                      <TextField
                        label="Plan Name"
                        value={plan.name}
                        onChange={(event) => setPlan((current) => ({ ...current, name: event.target.value }))}
                      />
                      <TextField
                        label="Objective"
                        multiline
                        minRows={3}
                        value={plan.objective}
                        onChange={(event) => setPlan((current) => ({ ...current, objective: event.target.value }))}
                      />
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        <Chip label={`${plan.tasks.length} tasks`} sx={{ bgcolor: "#eef6ff" }} />
                        <Chip label={`${pipelines.length} pipelines`} sx={{ bgcolor: "#f8fbff" }} />
                        <Chip label={`Saved ${new Date(plan.saved_at).toLocaleString()}`} sx={{ bgcolor: "#f1f5f9" }} />
                      </Stack>
                      <Button variant="contained" onClick={savePlan} sx={noodlePrimaryButtonSx}>
                        Save Soup Plan
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Typography variant="h5">Add Pipeline Job Task</Typography>
                      <TextField
                        select
                        label="Pipeline"
                        value={selectedPipelineId}
                        onChange={(event) => setSelectedPipelineId(event.target.value)}
                        helperText={busy ? "Loading pipelines..." : "Choose the pipeline job to assign into this plan."}
                      >
                        {pipelines.map((pipeline) => (
                          <MenuItem key={pipeline.id} value={pipeline.id}>
                            {pipeline.name}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField label="Task Name" value={taskName} onChange={(event) => setTaskName(event.target.value)} />
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                          <TextField
                            select
                            fullWidth
                            label="Trigger"
                            value={taskTrigger}
                            onChange={(event) => setTaskTrigger(event.target.value as NoodlePipelineRunCreateRequest["trigger"])}
                          >
                            <MenuItem value="manual">manual</MenuItem>
                            <MenuItem value="schedule">schedule</MenuItem>
                            <MenuItem value="event">event</MenuItem>
                            <MenuItem value="if">if</MenuItem>
                          </TextField>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField
                            select
                            fullWidth
                            label="Mode"
                            value={taskOrchestrationMode}
                            onChange={(event) =>
                              setTaskOrchestrationMode(event.target.value as NoodlePipelineRunCreateRequest["orchestration_mode"])
                            }
                          >
                            <MenuItem value="plan">plan</MenuItem>
                            <MenuItem value="tasks">tasks</MenuItem>
                          </TextField>
                        </Grid>
                      </Grid>
                      <Button
                        variant="outlined"
                        onClick={addTask}
                        sx={noodleSecondaryButtonSx}
                        disabled={!selectedPipeline || busy}
                      >
                        Add Task
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Grid>

            <Grid item xs={12} lg={7}>
              <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.5}>
                      <Box>
                        <Typography variant="h5">Assigned Tasks</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Each task maps to a pipeline job and is grouped under this single Soup Scheduler plan.
                        </Typography>
                      </Box>
                      <Button
                        variant="contained"
                        onClick={() => void dispatchPlan()}
                        sx={noodlePrimaryButtonSx}
                        disabled={dispatching || !plan.tasks.length}
                      >
                        {dispatching ? "Dispatching..." : "Dispatch Plan"}
                      </Button>
                    </Stack>
                    {plan.tasks.length ? (
                      <Stack spacing={1.5}>
                        {plan.tasks.map((task, index) => (
                          <Box key={task.id} sx={{ p: 1.8, borderRadius: 3, border: "1px solid var(--line)", bgcolor: "#fff" }}>
                            <Stack spacing={1.25}>
                              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                  Task {index + 1}
                                </Typography>
                                <Stack direction="row" spacing={1}>
                                  {task.last_status ? (
                                    <Chip
                                      size="small"
                                      label={titleize(task.last_status)}
                                      color={task.last_status === "success" ? "success" : task.last_status === "failed" ? "error" : "warning"}
                                    />
                                  ) : null}
                                  <Button
                                    color="error"
                                    onClick={() =>
                                      setPlan((current) => ({
                                        ...current,
                                        tasks: current.tasks.filter((entry) => entry.id !== task.id)
                                      }))
                                    }
                                  >
                                    Remove
                                  </Button>
                                </Stack>
                              </Stack>
                              <TextField
                                label="Task Name"
                                value={task.task_name}
                                onChange={(event) => updateTask(task.id, (current) => ({ ...current, task_name: event.target.value }))}
                              />
                              <Grid container spacing={2}>
                                <Grid item xs={12} md={6}>
                                  <TextField
                                    select
                                    fullWidth
                                    label="Pipeline"
                                    value={task.pipeline_id}
                                    onChange={(event) => {
                                      const pipeline = pipelines.find((entry) => entry.id === event.target.value);
                                      updateTask(task.id, (current) => ({
                                        ...current,
                                        pipeline_id: event.target.value,
                                        pipeline_name: pipeline?.name ?? current.pipeline_name
                                      }));
                                    }}
                                  >
                                    {pipelines.map((pipeline) => (
                                      <MenuItem key={pipeline.id} value={pipeline.id}>
                                        {pipeline.name}
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                </Grid>
                                <Grid item xs={12} md={3}>
                                  <TextField
                                    select
                                    fullWidth
                                    label="Trigger"
                                    value={task.trigger}
                                    onChange={(event) =>
                                      updateTask(task.id, (current) => ({
                                        ...current,
                                        trigger: event.target.value as NoodlePipelineRunCreateRequest["trigger"]
                                      }))
                                    }
                                  >
                                    <MenuItem value="manual">manual</MenuItem>
                                    <MenuItem value="schedule">schedule</MenuItem>
                                    <MenuItem value="event">event</MenuItem>
                                    <MenuItem value="if">if</MenuItem>
                                  </TextField>
                                </Grid>
                                <Grid item xs={12} md={3}>
                                  <TextField
                                    select
                                    fullWidth
                                    label="Mode"
                                    value={task.orchestration_mode}
                                    onChange={(event) =>
                                      updateTask(task.id, (current) => ({
                                        ...current,
                                        orchestration_mode: event.target.value as NoodlePipelineRunCreateRequest["orchestration_mode"]
                                      }))
                                    }
                                  >
                                    <MenuItem value="plan">plan</MenuItem>
                                    <MenuItem value="tasks">tasks</MenuItem>
                                  </TextField>
                                </Grid>
                              </Grid>
                              <TextField
                                label="Depends On"
                                value={task.depends_on.join(", ")}
                                onChange={(event) =>
                                  updateTask(task.id, (current) => ({
                                    ...current,
                                    depends_on: event.target.value
                                      .split(",")
                                      .map((entry) => entry.trim())
                                      .filter(Boolean)
                                  }))
                                }
                                helperText="Comma-separated task ids from this plan."
                              />
                              <TextField
                                label="Notes"
                                multiline
                                minRows={2}
                                value={task.notes}
                                onChange={(event) => updateTask(task.id, (current) => ({ ...current, notes: event.target.value }))}
                              />
                              {task.last_run_id ? (
                                <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                                  Last run id: {task.last_run_id}
                                </Typography>
                              ) : null}
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Alert severity="info">No tasks assigned yet. Add pipeline jobs to compose your Soup Scheduler plan.</Alert>
                    )}
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
