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
import { alpha } from "@mui/material/styles";
import ReactFlow, {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowProvider,
  type Connection,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeDragHandler,
  type NodeProps
} from "reactflow";

import { createNoodlePipelineRun, listNoodlePipelines } from "@/lib/api";
import {
  clearPendingNoodleSchedulerSession,
  loadNoodlePipelineDraft,
  loadPendingNoodleSchedulerSession,
  loadSavedNoodlePipelines,
  loadSavedNoodleSchedulerPlans,
  upsertSavedNoodleSchedulerPlan
} from "@/lib/scenario-store";
import type {
  NoodlePipelineDesignerDocument,
  NoodlePipelineRunCreateRequest,
  NoodleSchedulerExecutionProfile,
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

type SchedulerNodeData = {
  label: string;
  pipelineName: string;
  trigger: NoodlePipelineRunCreateRequest["trigger"];
  orchestrationMode: NoodlePipelineRunCreateRequest["orchestration_mode"];
  executionProfile: NoodleSchedulerExecutionProfile;
  dependencyCount: number;
  status: NoodleSchedulerPlanTask["last_status"];
  published: boolean;
  selected: boolean;
};

function SchedulerTaskNode({ data }: NodeProps<SchedulerNodeData>) {
  const statusColor =
    data.status === "success"
      ? "#2f855a"
      : data.status === "failed"
        ? "#c53030"
        : data.status === "running"
          ? "#c58b00"
          : "#2d5d9f";

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 11, height: 11, left: -7, border: "2px solid #fff", background: statusColor }}
      />
      <Box
        sx={{
          width: 254,
          borderRadius: 4,
          border: data.selected ? "2px solid #0f3c75" : "1px solid rgba(62, 101, 149, 0.3)",
          background:
            "radial-gradient(circle at top right, rgba(111, 208, 255, 0.24), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(238, 246, 255, 0.96) 100%)",
          boxShadow: data.selected ? "0 22px 42px rgba(15, 23, 42, 0.18)" : "0 14px 28px rgba(15, 23, 42, 0.08)",
          overflow: "hidden"
        }}
      >
        <Box
          sx={{
            px: 1.7,
            py: 1.2,
            borderBottom: "1px solid rgba(148, 163, 184, 0.24)",
            background: `linear-gradient(135deg, ${alpha(statusColor, 0.14)} 0%, rgba(255,255,255,0.16) 100%)`
          }}
        >
          <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.15 }}>
                {data.label}
              </Typography>
              <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                {data.pipelineName}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={data.published ? "Published" : "Draft"}
              sx={{
                height: 22,
                fontWeight: 800,
                bgcolor: data.published ? "#e8fff2" : "#fff4db",
                color: data.published ? "#20704a" : "#9a6400"
              }}
            />
          </Stack>
        </Box>
        <Stack spacing={1.1} sx={{ px: 1.7, py: 1.4 }}>
          <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap">
            <Chip size="small" label={titleize(data.executionProfile)} sx={{ bgcolor: "#eaf7ff", fontWeight: 700 }} />
            <Chip size="small" label={`Trigger ${data.trigger}`} sx={{ bgcolor: "#eef6ff", fontWeight: 700 }} />
            <Chip size="small" label={`Mode ${data.orchestrationMode}`} sx={{ bgcolor: "#f5f9ff", fontWeight: 700 }} />
          </Stack>
          <Typography variant="caption" sx={{ color: "var(--muted)" }}>
            Waits on {data.dependencyCount} upstream task{data.dependencyCount === 1 ? "" : "s"}.
          </Typography>
        </Stack>
      </Box>
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 11, height: 11, right: -7, border: "2px solid #fff", background: statusColor }}
      />
    </>
  );
}

const schedulerNodeTypes = {
  schedulerTask: SchedulerTaskNode
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function appendNote(existing: string, message: string) {
  return existing.trim() ? `${existing.trim()} ${message}` : message;
}

function buildTaskCanvasPosition(task: NoodleSchedulerPlanTask, index: number) {
  if (task.canvas_position) {
    return task.canvas_position;
  }

  const column = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 44 + column * 296,
    y: 44 + row * 184
  };
}

function canReachTask(tasks: NoodleSchedulerPlanTask[], fromTaskId: string, targetTaskId: string): boolean {
  const visited = new Set<string>();
  const queue = [fromTaskId];

  while (queue.length) {
    const currentTaskId = queue.shift();
    if (!currentTaskId || visited.has(currentTaskId)) {
      continue;
    }
    if (currentTaskId === targetTaskId) {
      return true;
    }
    visited.add(currentTaskId);
    const downstreamTasks = tasks
      .filter((task) => task.depends_on.includes(currentTaskId))
      .map((task) => task.id);
    queue.push(...downstreamTasks);
  }

  return false;
}

function validateDependencies(
  tasks: NoodleSchedulerPlanTask[],
  taskId: string,
  nextDependencies: string[]
) {
  const deduped = nextDependencies.filter((dependencyId, index) => dependencyId && nextDependencies.indexOf(dependencyId) === index);
  if (deduped.includes(taskId)) {
    return "A task cannot depend on itself.";
  }
  const unknownDependencies = deduped.filter((dependencyId) => !tasks.some((task) => task.id === dependencyId));
  if (unknownDependencies.length) {
    return `Unknown dependency task id: ${unknownDependencies.slice(0, 3).join(", ")}.`;
  }
  const createsCycle = deduped.some((dependencyId) => canReachTask(tasks, taskId, dependencyId));
  if (createsCycle) {
    return "That dependency would create a cycle. Soup Scheduler only allows DAG orchestration.";
  }
  return null;
}

function inferExecutionProfile(
  pipeline: NoodlePipelineDesignerDocument | null | undefined,
  trigger: NoodlePipelineRunCreateRequest["trigger"]
): NoodleSchedulerExecutionProfile {
  if (trigger === "event") {
    return "streaming";
  }
  if (trigger === "manual" && !pipeline?.schedule.enabled) {
    return "one_time_ingestion";
  }
  if (pipeline?.schedule.trigger === "event") {
    return "streaming";
  }
  return "batch";
}

function readExecutionProfile(task: NoodleSchedulerPlanTask): NoodleSchedulerExecutionProfile {
  return task.execution_profile ?? "batch";
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
  orchestrationMode: NoodlePipelineRunCreateRequest["orchestration_mode"],
  executionProfile: NoodleSchedulerExecutionProfile
): NoodleSchedulerPlanTask {
  return {
    id: createId("soup-task"),
    task_name: taskName.trim() || `${pipeline.name} task`,
    pipeline_id: pipeline.id,
    pipeline_name: pipeline.name,
    trigger,
    orchestration_mode: orchestrationMode,
    execution_profile: executionProfile,
    depends_on: [],
    notes: "Assigned from Soup Scheduler.",
    canvas_position: null
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
    execution_profile: inferExecutionProfile(fallbackPipeline, pending.orchestrator_plan?.trigger ?? "manual"),
    depends_on: task.depends_on ?? [],
    notes: task.notes || "Imported from orchestrator plan.",
    canvas_position: null
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [taskName, setTaskName] = useState("");
  const [taskTrigger, setTaskTrigger] = useState<NoodlePipelineRunCreateRequest["trigger"]>("manual");
  const [taskOrchestrationMode, setTaskOrchestrationMode] = useState<NoodlePipelineRunCreateRequest["orchestration_mode"]>("plan");
  const [taskExecutionProfile, setTaskExecutionProfile] = useState<NoodleSchedulerExecutionProfile>("one_time_ingestion");
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
        const pending = loadPendingNoodleSchedulerSession();
        const savedPlans = loadSavedNoodleSchedulerPlans();
        const savedPlan = savedPlans[0] ?? buildDefaultPlan();
        let pipelineList = await listNoodlePipelines();
        if (!pipelineList.length) {
          pipelineList = loadSavedNoodlePipelines();
        }
        const localDraft = loadNoodlePipelineDraft();
        if (!active) {
          return;
        }
        if (localDraft && !pipelineList.some((entry) => entry.id === localDraft.id)) {
          pipelineList = [localDraft, ...pipelineList];
        }
        if (pending?.document && !pipelineList.some((entry) => entry.id === pending.document?.id)) {
          pipelineList = [pending.document, ...pipelineList];
        }
        const preferredPipeline =
          pending?.document
            ? pipelineList.find((entry) => entry.id === pending.document?.id)
            : pending?.intent_name
              ? pipelineList.find((entry) => entry.name === pending.intent_name)
              : pipelineList[0];
        setPipelines(pipelineList);
        setSelectedPipelineId(preferredPipeline?.id ?? pipelineList[0]?.id ?? "");
        setPlan(buildPlanFromPendingSession(savedPlan, pipelineList));
      } catch (loadError) {
        const fallbackDraft = loadNoodlePipelineDraft();
        const fallbackSaved = loadSavedNoodlePipelines();
        const fallback =
          fallbackDraft && !fallbackSaved.some((entry) => entry.id === fallbackDraft.id)
            ? [fallbackDraft, ...fallbackSaved]
            : fallbackSaved;
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
  const selectedTask = useMemo(
    () => plan.tasks.find((task) => task.id === selectedTaskId) ?? null,
    [plan.tasks, selectedTaskId]
  );
  const executionProfileCounts = useMemo(
    () =>
      plan.tasks.reduce(
        (counts, task) => {
          counts[readExecutionProfile(task)] += 1;
          return counts;
        },
        {
          batch: 0,
          streaming: 0,
          one_time_ingestion: 0
        } as Record<NoodleSchedulerExecutionProfile, number>
      ),
    [plan.tasks]
  );
  const pipelineById = useMemo(() => new Map(pipelines.map((pipeline) => [pipeline.id, pipeline])), [pipelines]);
  const flowNodes = useMemo<FlowNode<SchedulerNodeData>[]>(
    () =>
      plan.tasks.map((task, index) => {
        const pipeline = pipelineById.get(task.pipeline_id);
        return {
          id: task.id,
          type: "schedulerTask",
          position: buildTaskCanvasPosition(task, index),
          data: {
            label: task.task_name,
            pipelineName: (pipeline?.name ?? task.pipeline_name) || "Unassigned pipeline",
            trigger: task.trigger,
            orchestrationMode: task.orchestration_mode,
            executionProfile: readExecutionProfile(task),
            dependencyCount: task.depends_on.length,
            status: task.last_status ?? null,
            published: pipeline?.status === "published",
            selected: task.id === selectedTaskId
          }
        };
      }),
    [pipelineById, plan.tasks, selectedTaskId]
  );
  const flowEdges = useMemo<FlowEdge[]>(
    () =>
      plan.tasks.flatMap((task) =>
        task.depends_on.map((dependencyId) => ({
          id: `${dependencyId}->${task.id}`,
          source: dependencyId,
          target: task.id,
          animated: task.last_status === "running",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: "#2d5d9f"
          },
          style: {
            stroke: "#2d5d9f",
            strokeWidth: 2.1
          }
        }))
      ),
    [plan.tasks]
  );

  useEffect(() => {
    if (!plan.tasks.length) {
      setSelectedTaskId(null);
      return;
    }
    if (selectedTaskId && plan.tasks.some((task) => task.id === selectedTaskId)) {
      return;
    }
    setSelectedTaskId(plan.tasks[0].id);
  }, [plan.tasks, selectedTaskId]);

  useEffect(() => {
    setTaskExecutionProfile(inferExecutionProfile(selectedPipeline, taskTrigger));
  }, [selectedPipeline, taskTrigger]);

  function savePlan() {
    const next = { ...plan, saved_at: new Date().toISOString() };
    setPlan(next);
    upsertSavedNoodleSchedulerPlan(next);
    setNotice("Soup Scheduler plan saved.");
  }

  function removeTask(taskId: string) {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks
        .filter((task) => task.id !== taskId)
        .map((task) => ({
          ...task,
          depends_on: task.depends_on.filter((dependencyId) => dependencyId !== taskId)
        }))
    }));
    if (selectedTaskId === taskId) {
      setSelectedTaskId(null);
    }
  }

  function addTask() {
    if (!selectedPipeline) {
      setError("Select a pipeline before adding a task.");
      return;
    }
    setError(null);
    const nextTask = buildTask(selectedPipeline, taskName, taskTrigger, taskOrchestrationMode, taskExecutionProfile);
    setPlan((current) => ({
      ...current,
      tasks: [
        ...current.tasks,
        {
          ...nextTask,
          canvas_position: buildTaskCanvasPosition(nextTask, current.tasks.length)
        }
      ]
    }));
    setSelectedTaskId(nextTask.id);
    setTaskName("");
  }

  function updateTask(taskId: string, updater: (task: NoodleSchedulerPlanTask) => NoodleSchedulerPlanTask) {
    setPlan((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === taskId ? updater(task) : task))
    }));
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) {
      return;
    }
    const sourceId = connection.source;
    const targetId = connection.target;
    if (sourceId === targetId) {
      setError("A task cannot depend on itself.");
      return;
    }
    if (canReachTask(plan.tasks, targetId, sourceId)) {
      setError("That dependency would create a cycle. Soup Scheduler only allows DAG orchestration.");
      return;
    }

    const sourceTask = plan.tasks.find((task) => task.id === sourceId);
    const targetTask = plan.tasks.find((task) => task.id === targetId);
    setError(null);
    setNotice(`Linked ${sourceTask?.task_name ?? sourceId} into ${targetTask?.task_name ?? targetId}.`);
    updateTask(targetId, (task) => ({
      ...task,
      depends_on: task.depends_on.includes(sourceId) ? task.depends_on : [...task.depends_on, sourceId]
    }));
    setSelectedTaskId(targetId);
  }

  const handleNodeDragStop: NodeDragHandler = (_, node) => {
    updateTask(node.id, (task) => ({
      ...task,
      canvas_position: {
        x: Math.round(node.position.x),
        y: Math.round(node.position.y)
      }
    }));
  };

  function handleEdgeRemove(edgeId: string) {
    const [sourceId, targetId] = edgeId.split("->");
    if (!sourceId || !targetId) {
      return;
    }
    updateTask(targetId, (task) => ({
      ...task,
      depends_on: task.depends_on.filter((dependencyId) => dependencyId !== sourceId)
    }));
    setNotice("Dependency removed from Soup Scheduler DAG.");
  }

  async function dispatchPlan() {
    if (!plan.tasks.length) {
      setError("Add at least one task before dispatching the plan.");
      return;
    }

    setDispatching(true);
    setError(null);
    setNotice(null);

    let successCount = 0;
    let failureCount = 0;
    const failureMessages: string[] = [];
    const nextTasks = [...plan.tasks];
    const pipelineById = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline]));

    for (let index = 0; index < nextTasks.length; index += 1) {
      const task = nextTasks[index];
      if (!task.pipeline_id) {
        failureCount += 1;
        failureMessages.push(`${task.task_name}: missing pipeline assignment.`);
        nextTasks[index] = {
          ...task,
          last_status: "failed",
          notes: appendNote(task.notes, "Missing pipeline assignment.")
        };
        continue;
      }

      const pipeline = pipelineById.get(task.pipeline_id);
      if (!pipeline) {
        failureCount += 1;
        failureMessages.push(`${task.task_name}: selected pipeline could not be found in the current scheduler catalog.`);
        nextTasks[index] = {
          ...task,
          last_status: "failed",
          notes: appendNote(task.notes, "Selected pipeline could not be found in the current scheduler catalog.")
        };
        continue;
      }

      if (pipeline.status !== "published") {
        failureCount += 1;
        failureMessages.push(`${task.task_name}: pipeline "${pipeline.name}" is still a draft. Publish it before dispatching from Soup Scheduler.`);
        nextTasks[index] = {
          ...task,
          last_status: "failed",
          notes: appendNote(task.notes, "Pipeline is still a draft. Publish it before dispatching from Soup Scheduler.")
        };
        continue;
      }
      try {
        const executionProfile = readExecutionProfile(task);
        const response = await createNoodlePipelineRun(task.pipeline_id, {
          trigger: task.trigger,
          orchestration_mode: task.orchestration_mode
        });
        successCount += 1;
        nextTasks[index] = {
          ...task,
          last_run_id: response.run.id,
          last_status: response.run.status,
          notes: appendNote(task.notes, `${titleize(executionProfile)} dispatch accepted with run ${response.run.id}.`)
        };
      } catch (dispatchError) {
        failureCount += 1;
        const reason =
          dispatchError instanceof Error ? dispatchError.message : "Dispatch failed; verify pipeline and run API availability.";
        failureMessages.push(`${task.task_name}: ${reason}`);
        nextTasks[index] = {
          ...task,
          last_status: "failed",
          notes: appendNote(task.notes, reason)
        };
      }
    }

    const nextPlan = { ...plan, tasks: nextTasks, saved_at: new Date().toISOString() };
    setPlan(nextPlan);
    upsertSavedNoodleSchedulerPlan(nextPlan);
    setDispatching(false);
    if (!successCount && failureMessages.length) {
      setError(failureMessages.slice(0, 3).join(" "));
    } else if (failureMessages.length) {
      setError(failureMessages.slice(0, 3).join(" "));
      setNotice(`Soup Scheduler dispatched: ${successCount} succeeded, ${failureCount} failed.`);
    } else {
      setNotice(`Soup Scheduler dispatched: ${successCount} succeeded, ${failureCount} failed.`);
    }
  }

  return (
    <ReactFlowProvider>
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
                Build a single multi-pipeline execution plan, mix batch, streaming, and one-time ingestion tasks on one DAG canvas, and dispatch runs from one control page.
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
          {!busy && !pipelines.length ? (
            <Alert severity="warning">
              No pipelines are available in Soup Scheduler yet. Save or publish a pipeline from the designer first, then return here.
            </Alert>
          ) : null}

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
                          <Chip label={`${executionProfileCounts.batch} batch`} sx={{ bgcolor: "#eef7ff" }} />
                          <Chip label={`${executionProfileCounts.streaming} streaming`} sx={{ bgcolor: "#ecfff5" }} />
                          <Chip label={`${executionProfileCounts.one_time_ingestion} one-time`} sx={{ bgcolor: "#fff7e8" }} />
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
                          helperText={
                            busy
                              ? "Loading pipelines..."
                              : selectedPipeline
                                ? `${selectedPipeline.status === "published" ? "Published" : "Draft"} pipeline selected. Suggested execution profile: ${titleize(taskExecutionProfile)}. Only published pipelines can run from Soup Scheduler.`
                                : "Choose the pipeline job to assign into this plan."
                          }
                      >
                        {pipelines.map((pipeline) => (
                          <MenuItem key={pipeline.id} value={pipeline.id}>
                            {pipeline.name} {pipeline.status === "published" ? "(published)" : "(draft)"}
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
                        <TextField
                          select
                          fullWidth
                          label="Execution Profile"
                          value={taskExecutionProfile}
                          onChange={(event) => setTaskExecutionProfile(event.target.value as NoodleSchedulerExecutionProfile)}
                          helperText="Choose whether this task is a batch run, a long-running streaming flow, or a one-time ingestion kick-off."
                        >
                          <MenuItem value="batch">batch</MenuItem>
                          <MenuItem value="streaming">streaming</MenuItem>
                          <MenuItem value="one_time_ingestion">one_time_ingestion</MenuItem>
                        </TextField>
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
              <Stack spacing={3}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2.2}>
                      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.5}>
                        <Box>
                          <Typography variant="h5">Schedule DAG Canvas</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Connect nodes to define task dependencies, drag them to shape the schedule, and orchestrate batch, streaming, and one-time ingestion flows in one graph.
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
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        <Chip label={`${flowNodes.length} scheduled nodes`} sx={{ bgcolor: "#eef6ff" }} />
                        <Chip label={`${flowEdges.length} dependency edges`} sx={{ bgcolor: "#f4f9ff" }} />
                        <Chip label={`${executionProfileCounts.streaming} streaming live`} sx={{ bgcolor: "#ecfff5" }} />
                        <Chip label={selectedTask ? `Focused ${selectedTask.task_name}` : "Select a node to edit"} sx={{ bgcolor: "#fff8e8" }} />
                      </Stack>
                      <Box
                        sx={{
                          height: 460,
                          borderRadius: 5,
                          overflow: "hidden",
                          border: "1px solid rgba(148, 163, 184, 0.3)",
                          background:
                            "radial-gradient(circle at top left, rgba(111, 208, 255, 0.22), transparent 18%), radial-gradient(circle at 92% 10%, rgba(255, 209, 102, 0.16), transparent 14%), linear-gradient(180deg, #fbfdff 0%, #eef5fb 100%)"
                        }}
                      >
                        {plan.tasks.length ? (
                          <ReactFlow
                            nodes={flowNodes}
                            edges={flowEdges}
                            nodeTypes={schedulerNodeTypes}
                            fitView
                            connectionMode={ConnectionMode.Loose}
                            nodesDraggable
                            nodesConnectable
                            elementsSelectable
                            snapToGrid
                            snapGrid={[20, 20]}
                            onNodeClick={(_, node) => {
                              setSelectedTaskId(node.id);
                              setNotice(null);
                            }}
                            onConnect={handleConnect}
                            onNodeDragStop={handleNodeDragStop}
                            onEdgesDelete={(edges) => edges.forEach((edge) => handleEdgeRemove(edge.id))}
                            proOptions={{ hideAttribution: true }}
                          >
                            <MiniMap
                              pannable
                              zoomable
                              nodeColor={(node) => (node.data?.published ? "#d8ecff" : "#ffe8b3")}
                              nodeStrokeColor={(node) => (node.data?.selected ? "#0f3c75" : "#2d5d9f")}
                              maskColor="rgba(8, 27, 56, 0.08)"
                              style={{
                                background: "rgba(255,255,255,0.88)",
                                border: "1px solid rgba(148, 163, 184, 0.28)",
                                borderRadius: 18
                              }}
                            />
                            <Controls
                              style={{
                                border: "1px solid rgba(148, 163, 184, 0.32)",
                                borderRadius: 18,
                                overflow: "hidden",
                                boxShadow: "0 10px 28px rgba(15, 23, 42, 0.10)"
                              }}
                            />
                            <Background color="#cfe0f2" gap={20} size={1.1} />
                          </ReactFlow>
                        ) : (
                          <Stack justifyContent="center" alignItems="center" sx={{ height: "100%", px: 3 }} spacing={1.25}>
                            <Typography variant="h6">No scheduled tasks on the DAG yet</Typography>
                            <Typography variant="body2" sx={{ color: "var(--muted)", maxWidth: 460, textAlign: "center" }}>
                              Add a pipeline task from the left panel, then connect nodes here to orchestrate execution order visually.
                            </Typography>
                          </Stack>
                        )}
                      </Box>
                      <Alert severity="info">
                        Draw an edge from one task into another to make the target wait for the source. Delete an edge to remove that dependency.
                      </Alert>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1.5}>
                        <Box>
                          <Typography variant="h5">Assigned Tasks</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            The task editor stays in sync with the DAG canvas, so you can tune task settings after wiring the flow.
                          </Typography>
                        </Box>
                      </Stack>
                      {plan.tasks.length ? (
                        <Stack spacing={1.5}>
                          {plan.tasks.map((task, index) => (
                            <Box
                              key={task.id}
                              sx={{
                                p: 1.8,
                                borderRadius: 3,
                                border: task.id === selectedTaskId ? "2px solid #0f3c75" : "1px solid var(--line)",
                                bgcolor: task.id === selectedTaskId ? "#f8fbff" : "#fff",
                                boxShadow: task.id === selectedTaskId ? "0 16px 28px rgba(15, 23, 42, 0.08)" : "none"
                              }}
                            >
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
                                    <Button color="error" onClick={() => removeTask(task.id)}>
                                      Remove
                                    </Button>
                                  </Stack>
                                </Stack>
                                <Button
                                  variant="text"
                                  onClick={() => setSelectedTaskId(task.id)}
                                  sx={{ alignSelf: "flex-start", minHeight: 0, px: 0, fontWeight: 700, textTransform: "none" }}
                                >
                                  Focus This Task On Canvas
                                </Button>
                                <TextField
                                  label="Task Name"
                                  value={task.task_name}
                                  onChange={(event) => {
                                    setSelectedTaskId(task.id);
                                    updateTask(task.id, (current) => ({ ...current, task_name: event.target.value }));
                                  }}
                                />
                                <Grid container spacing={2}>
                                  <Grid item xs={12} md={6}>
                                    <TextField
                                      select
                                      fullWidth
                                      label="Pipeline"
                                      value={task.pipeline_id}
                                      onChange={(event) => {
                                        setSelectedTaskId(task.id);
                                        const pipeline = pipelineById.get(event.target.value);
                                        updateTask(task.id, (current) => ({
                                          ...current,
                                          pipeline_id: event.target.value,
                                          pipeline_name: pipeline?.name ?? current.pipeline_name,
                                          last_status: null
                                        }));
                                      }}
                                    >
                                      {pipelines.map((pipeline) => (
                                        <MenuItem key={pipeline.id} value={pipeline.id}>
                                          {pipeline.name} {pipeline.status === "published" ? "(published)" : "(draft)"}
                                        </MenuItem>
                                      ))}
                                      </TextField>
                                    </Grid>
                                  <Grid item xs={12} md={4}>
                                    <TextField
                                      select
                                      fullWidth
                                      label="Execution"
                                      value={readExecutionProfile(task)}
                                      onChange={(event) => {
                                        setSelectedTaskId(task.id);
                                        updateTask(task.id, (current) => ({
                                          ...current,
                                          execution_profile: event.target.value as NoodleSchedulerExecutionProfile
                                        }));
                                      }}
                                    >
                                      <MenuItem value="batch">batch</MenuItem>
                                      <MenuItem value="streaming">streaming</MenuItem>
                                      <MenuItem value="one_time_ingestion">one_time_ingestion</MenuItem>
                                    </TextField>
                                  </Grid>
                                  <Grid item xs={12} md={2}>
                                    <TextField
                                      select
                                      fullWidth
                                      label="Trigger"
                                      value={task.trigger}
                                      onChange={(event) => {
                                        setSelectedTaskId(task.id);
                                        updateTask(task.id, (current) => ({
                                          ...current,
                                          trigger: event.target.value as NoodlePipelineRunCreateRequest["trigger"]
                                        }));
                                      }}
                                    >
                                      <MenuItem value="manual">manual</MenuItem>
                                      <MenuItem value="schedule">schedule</MenuItem>
                                      <MenuItem value="event">event</MenuItem>
                                      <MenuItem value="if">if</MenuItem>
                                    </TextField>
                                  </Grid>
                                  <Grid item xs={12} md={2}>
                                    <TextField
                                      select
                                      fullWidth
                                      label="Mode"
                                      value={task.orchestration_mode}
                                      onChange={(event) => {
                                        setSelectedTaskId(task.id);
                                        updateTask(task.id, (current) => ({
                                          ...current,
                                          orchestration_mode: event.target.value as NoodlePipelineRunCreateRequest["orchestration_mode"]
                                        }));
                                      }}
                                    >
                                      <MenuItem value="plan">plan</MenuItem>
                                      <MenuItem value="tasks">tasks</MenuItem>
                                    </TextField>
                                  </Grid>
                                </Grid>
                                <TextField
                                  label="Depends On"
                                  value={task.depends_on.join(", ")}
                                  onChange={(event) => {
                                    const nextDependencies = event.target.value
                                      .split(",")
                                      .map((entry) => entry.trim())
                                      .filter(Boolean);
                                    const dependencyError = validateDependencies(plan.tasks, task.id, nextDependencies);
                                    setSelectedTaskId(task.id);
                                    if (dependencyError) {
                                      setError(dependencyError);
                                      return;
                                    }
                                    setError(null);
                                    updateTask(task.id, (current) => ({
                                      ...current,
                                      depends_on: nextDependencies
                                    }));
                                  }}
                                  helperText="Comma-separated task ids from this plan. Canvas links update this automatically."
                                />
                                <TextField
                                  label="Notes"
                                  multiline
                                  minRows={2}
                                  value={task.notes}
                                  onChange={(event) => {
                                    setSelectedTaskId(task.id);
                                    updateTask(task.id, (current) => ({ ...current, notes: event.target.value }));
                                  }}
                                />
                                {(() => {
                                  const assignedPipeline = pipelineById.get(task.pipeline_id);
                                  if (!assignedPipeline) {
                                    return (
                                      <Alert severity="warning">
                                        This task points to a pipeline that is no longer available in the current scheduler catalog.
                                      </Alert>
                                    );
                                  }
                                  if (assignedPipeline.status !== "published") {
                                    return (
                                      <Alert severity="info">
                                        {assignedPipeline.name} is currently a draft. Publish a release before dispatching this task.
                                      </Alert>
                                    );
                                  }
                                  return null;
                                })()}
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
              </Stack>
            </Grid>
          </Grid>
          </Stack>
        </Container>
      </Box>
    </ReactFlowProvider>
  );
}
