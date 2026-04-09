"use client";

import "reactflow/dist/style.css";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, LayoutTemplate, ListTree, Play, Rocket, Save, ShieldCheck, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, type Connection, type Edge, type Node } from "reactflow";

import { getOpalTemplates, nodeCatalog, sortNodesForWorkflowSteps } from "@data-platform/designer-core";
import { Badge, Button, Toolbar, ValidationList } from "@data-platform/ui";

import { getPipeline, publishPipeline, runPipeline, savePipeline, validatePipeline } from "@/lib/api";
import { NodeInspector } from "@/components/node-inspector";
import { NodePalette } from "@/components/node-palette";
import { RunsPanel } from "@/components/runs-panel";
import { useDesignerStore } from "@/stores/designer-store";

type EditorMode = "builder" | "advanced";
type PromptMode = "replace" | "append";

function formatConfigValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value ?? "");
}

function summarizeNodeConfig(config: Record<string, unknown>) {
  return Object.entries(config)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 3);
}

function StepCard({
  node,
  index,
  selected,
  onSelect
}: {
  node: ReturnType<typeof useDesignerStore.getState>["spec"]["nodes"][number];
  index: number;
  selected: boolean;
  onSelect(): void;
}) {
  const configEntries = summarizeNodeConfig(node.config);

  return (
    <button
      onClick={onSelect}
      className={`group relative w-full rounded-[28px] border px-5 py-5 text-left transition ${
        selected
          ? "border-sky-400 bg-sky-50 shadow-[0_18px_40px_rgba(14,116,144,0.12)]"
          : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/60"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={selected ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700"}>Step {index + 1}</Badge>
            <Badge className="bg-amber-50 text-amber-700">{node.category}</Badge>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-950">{node.name}</h3>
          <p className="mt-1 text-sm text-slate-600">{node.description || "Add details for this step in the inspector."}</p>
        </div>
        <p className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">{node.type}</p>
      </div>
      {configEntries.length > 0 ? (
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          {configEntries.map(([key, value]) => (
            <div key={key} className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{key}</p>
              <p className="mt-1 text-sm text-slate-800">{formatConfigValue(value)}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-500">
          This step still needs configuration.
        </div>
      )}
    </button>
  );
}

function DesignerActions({
  dirty,
  mode,
  onModeChange,
  onSave,
  onValidate,
  onPublish,
  onRun,
  onDelete
}: {
  dirty: boolean;
  mode: EditorMode;
  onModeChange(mode: EditorMode): void;
  onSave(): void;
  onValidate(): void;
  onPublish(): void;
  onRun(): void;
  onDelete(): void;
}) {
  return (
    <Toolbar>
      <div className="mr-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Workflow Studio</p>
        <h2 className="text-lg font-semibold text-slate-900">Prompt first, graph when needed</h2>
      </div>
      <Badge className={dirty ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>{dirty ? "Unsaved changes" : "Saved"}</Badge>
      <div className="flex rounded-full border border-slate-200 bg-slate-50 p-1">
        <button
          onClick={() => onModeChange("builder")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "builder" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Builder
          </div>
        </button>
        <button
          onClick={() => onModeChange("advanced")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === "advanced" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
        >
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4" />
            Advanced
          </div>
        </button>
      </div>
      <Button onClick={onSave} className="rounded-full">
        <Save className="mr-2 h-4 w-4" />
        Save Draft
      </Button>
      <Button onClick={onValidate} className="rounded-full bg-slate-900 hover:bg-slate-800">
        <ShieldCheck className="mr-2 h-4 w-4" />
        Validate
      </Button>
      <Button onClick={onPublish} className="rounded-full bg-amber-500 text-slate-950 hover:bg-amber-400">
        <Rocket className="mr-2 h-4 w-4" />
        Publish
      </Button>
      <Button onClick={onRun} className="rounded-full bg-teal-700 hover:bg-teal-600">
        <Play className="mr-2 h-4 w-4" />
        Run
      </Button>
      <Button onClick={onDelete} className="rounded-full bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
        <Trash2 className="mr-2 h-4 w-4" />
        Delete Selected
      </Button>
    </Toolbar>
  );
}

function DesignerSurface({ pipelineId }: { pipelineId: string }) {
  const router = useRouter();
  const spec = useDesignerStore((state) => state.spec);
  const dirty = useDesignerStore((state) => state.dirty);
  const issues = useDesignerStore((state) => state.issues);
  const promptSummary = useDesignerStore((state) => state.promptSummary);
  const selectedNodeId = useDesignerStore((state) => state.selectedNodeId);
  const selectedEdgeId = useDesignerStore((state) => state.selectedEdgeId);
  const loadSpec = useDesignerStore((state) => state.loadSpec);
  const addNodeToStore = useDesignerStore((state) => state.addNode);
  const applyPrompt = useDesignerStore((state) => state.applyPrompt);
  const connectNodes = useDesignerStore((state) => state.connectNodes);
  const updateNodePosition = useDesignerStore((state) => state.updateNodePosition);
  const selectNode = useDesignerStore((state) => state.selectNode);
  const selectEdge = useDesignerStore((state) => state.selectEdge);
  const deleteSelection = useDesignerStore((state) => state.deleteSelection);
  const validateLocal = useDesignerStore((state) => state.validate);
  const markClean = useDesignerStore((state) => state.markClean);

  const [editorMode, setEditorMode] = useState<EditorMode>("builder");
  const [promptMode, setPromptMode] = useState<PromptMode>("replace");
  const [prompt, setPrompt] = useState("");

  const pipelineQuery = useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => getPipeline(pipelineId)
  });

  useEffect(() => {
    if (pipelineQuery.data) {
      loadSpec(pipelineQuery.data.spec);
      setPrompt(pipelineQuery.data.spec.description || pipelineQuery.data.description || "");
    }
  }, [loadSpec, pipelineQuery.data]);

  const workflowSteps = useMemo(() => sortNodesForWorkflowSteps(spec), [spec]);
  const selectedNode = spec.nodes.find((node) => node.id === selectedNodeId) ?? workflowSteps[0];
  const orderedNodeIndex = useMemo(() => {
    return new Map(workflowSteps.map((node, index) => [node.id, index + 1]));
  }, [workflowSteps]);

  const rfNodes = useMemo<Node[]>(
    () =>
      spec.nodes.map((node) => ({
        id: node.id,
        position: node.position,
        data: {
          label: (
            <div className="rounded-[18px] bg-white px-4 py-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-sky-100 text-sky-800">Step {orderedNodeIndex.get(node.id) ?? "?"}</Badge>
                <Badge className="bg-slate-100 text-slate-700">{node.category}</Badge>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-900">{node.name}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{node.type}</p>
            </div>
          )
        },
        style: {
          width: 240,
          borderRadius: 18,
          border: node.id === selectedNodeId ? "2px solid #0284c7" : "1px solid #cbd5e1",
          background: "#ffffff",
          boxShadow: "0 12px 24px rgba(15, 23, 42, 0.08)",
          padding: 0
        }
      })),
    [orderedNodeIndex, selectedNodeId, spec.nodes]
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      spec.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: false,
        style: { stroke: edge.id === selectedEdgeId ? "#0284c7" : "#475569", strokeWidth: 2.5 }
      })),
    [selectedEdgeId, spec.edges]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const record = pipelineQuery.data;
      if (!record) {
        throw new Error("Pipeline metadata has not loaded from the control plane yet.");
      }
      return savePipeline({ ...record, name: spec.name, description: spec.description, currentVersion: spec.version, spec });
    },
    onSuccess(saved) {
      loadSpec(saved.spec);
      markClean();
      setPrompt(saved.spec.description || saved.description || "");
    }
  });

  const validateMutation = useMutation({
    mutationFn: () => validatePipeline(pipelineId),
    onSuccess(remoteIssues) {
      const localIssues = validateLocal();
      if (remoteIssues.length > 0) {
        useDesignerStore.setState({ issues: remoteIssues });
      } else {
        useDesignerStore.setState({ issues: localIssues });
      }
    }
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const localIssues = validateLocal();
      if (localIssues.some((issue) => issue.severity === "error")) {
        throw new Error("Pipeline contains validation errors.");
      }
      return publishPipeline(pipelineId);
    }
  });

  const runMutation = useMutation({
    mutationFn: () => runPipeline(pipelineId),
    onSuccess(run) {
      router.push(`/runs/${run.id}`);
    }
  });

  const onConnect = (connection: Connection) => {
    if (connection.source && connection.target) {
      connectNodes(connection.source, connection.target);
    }
  };

  const applyWorkflowPrompt = () => {
    applyPrompt(prompt, promptMode);
    setEditorMode("builder");
  };

  if (pipelineQuery.isLoading) {
    return <p className="text-sm text-slate-500">Loading pipeline from the control plane...</p>;
  }

  if (pipelineQuery.error instanceof Error) {
    return <p className="text-sm text-rose-600">{pipelineQuery.error.message}</p>;
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_32%),linear-gradient(135deg,#08111f_0%,#10213d_55%,#17345b_100%)] p-6 text-white shadow-[0_28px_70px_rgba(8,17,31,0.28)]">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div>
            <div className="flex items-center gap-2 text-sky-200">
              <Bot className="h-4 w-4" />
              <p className="text-xs font-semibold uppercase tracking-[0.22em]">Opal-Style Workflow Builder</p>
            </div>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight">Describe the workflow in plain English, then fine-tune the steps only where you need precision.</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-200">
              This keeps your existing pipeline backend, but shifts the front-end interaction closer to Google Opal: prompt to generate, remix with follow-up prompts, and drop into an advanced canvas when you need graph-level control.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {getOpalTemplates().map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    setPrompt(template.prompt);
                    setPromptMode("replace");
                    applyPrompt(template.prompt, "replace");
                    setEditorMode("builder");
                  }}
                  className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/10 p-5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100">Workflow Status</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-2xl bg-black/15 px-4 py-3">
                <span className="text-slate-200">Steps</span>
                <span className="font-semibold text-white">{spec.nodes.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-black/15 px-4 py-3">
                <span className="text-slate-200">Connections</span>
                <span className="font-semibold text-white">{spec.edges.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-black/15 px-4 py-3">
                <span className="text-slate-200">Schedule</span>
                <span className="font-semibold text-white">{spec.schedule.mode === "cron" ? spec.schedule.cron : spec.schedule.mode}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-black/15 px-4 py-3">
                <span className="text-slate-200">Validation</span>
                <span className={`font-semibold ${issues.some((issue) => issue.severity === "error") ? "text-rose-200" : "text-emerald-200"}`}>
                  {issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "Ready"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-white/10 bg-white/10 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-full border border-white/10 bg-slate-950/30 p-1">
              <button
                onClick={() => setPromptMode("replace")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${promptMode === "replace" ? "bg-white text-slate-950" : "text-slate-200"}`}
              >
                Generate workflow
              </button>
              <button
                onClick={() => setPromptMode("append")}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${promptMode === "append" ? "bg-white text-slate-950" : "text-slate-200"}`}
              >
                Remix current workflow
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-200">
              <span>Examples:</span>
              <span>"Daily Postgres to Snowflake with SQL"</span>
              <span>"Add a cache log preview step"</span>
            </div>
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the workflow you want to build or how you want to change the current one."
            className="mt-4 min-h-32 w-full rounded-[24px] border border-white/10 bg-slate-950/35 px-4 py-4 text-sm text-white outline-none placeholder:text-slate-300 focus:border-sky-300"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={applyWorkflowPrompt} className="rounded-full border-white/0 bg-sky-400 text-slate-950 hover:bg-sky-300">
              <Wand2 className="mr-2 h-4 w-4" />
              {promptMode === "replace" ? "Generate Workflow" : "Apply Remix"}
            </Button>
            <Button onClick={() => validateMutation.mutate()} className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Validate Prompt Result
            </Button>
            {promptSummary ? (
              <div className="inline-flex items-center rounded-full bg-emerald-400/15 px-4 py-2 text-sm text-emerald-100">
                <Sparkles className="mr-2 h-4 w-4" />
                {promptSummary}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <DesignerActions
        dirty={dirty}
        mode={editorMode}
        onModeChange={setEditorMode}
        onSave={() => saveMutation.mutate()}
        onValidate={() => validateMutation.mutate()}
        onPublish={() => publishMutation.mutate()}
        onRun={() => runMutation.mutate()}
        onDelete={deleteSelection}
      />

      {(publishMutation.error || runMutation.error || saveMutation.error || validateMutation.error) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {(publishMutation.error as Error | null)?.message ??
            (runMutation.error as Error | null)?.message ??
            (saveMutation.error as Error | null)?.message ??
            (validateMutation.error as Error | null)?.message}
        </div>
      )}

      {editorMode === "builder" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Workflow Storyboard</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-950">{spec.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">{spec.description || "Use a prompt above to describe what this workflow should do."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-slate-100 text-slate-700">{spec.nodes.length} steps</Badge>
                  <Badge className="bg-slate-100 text-slate-700">{spec.schedule.mode === "cron" ? spec.schedule.cron : spec.schedule.mode}</Badge>
                </div>
              </div>

              {workflowSteps.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {workflowSteps.map((node, index) => (
                    <div key={node.id} className="relative">
                      {index < workflowSteps.length - 1 ? <div className="absolute left-6 top-[calc(100%+0.25rem)] h-4 border-l-2 border-dashed border-sky-200" /> : null}
                      <StepCard
                        node={node}
                        index={index}
                        selected={node.id === selectedNode?.id}
                        onSelect={() => selectNode(node.id)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <ListTree className="mx-auto h-8 w-8 text-slate-400" />
                  <h3 className="mt-4 text-lg font-semibold text-slate-900">No workflow steps yet</h3>
                  <p className="mt-2 text-sm text-slate-500">Start with a prompt above, or use quick-add to assemble the flow step by step.</p>
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Quick Add</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">Manual step controls</h3>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {nodeCatalog.map((item) => (
                  <button
                    key={item.type}
                    onClick={() => addNodeToStore(item.type)}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <ValidationList issues={issues} />
          </section>

          <div className="space-y-4">
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Selected Step</p>
              {selectedNode ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-sky-100 text-sky-800">Step {orderedNodeIndex.get(selectedNode.id) ?? 1}</Badge>
                      <Badge className="bg-slate-100 text-slate-700">{selectedNode.category}</Badge>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-slate-950">{selectedNode.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">{selectedNode.description}</p>
                  </div>
                  <div className="grid gap-3">
                    {Object.entries(selectedNode.config).map(([key, value]) => (
                      <div key={key} className="rounded-2xl border border-slate-200 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{key}</p>
                        <p className="mt-1 text-sm text-slate-800">{formatConfigValue(value) || "Unset"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500">Select a step to inspect its details.</p>
              )}
            </section>
            <NodeInspector />
            <RunsPanel pipelineId={pipelineId} />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
          <NodePalette onAdd={addNodeToStore} />
          <section className="grid min-h-[760px] gap-4 xl:grid-rows-[auto_minmax(0,1fr)_auto]">
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Advanced Editor</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">Manual graph control for production DAGs</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{spec.nodes.length} nodes</Badge>
                  <Badge>{spec.edges.length} edges</Badge>
                  <Badge>{issues.length} issues</Badge>
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 shadow-sm">
              <ReactFlow
                nodes={rfNodes}
                edges={rfEdges}
                fitView
                onConnect={onConnect}
                onNodeDragStop={(_, node) => updateNodePosition(node.id, node.position)}
                onNodeClick={(_, node) => selectNode(node.id)}
                onEdgeClick={(_, edge) => selectEdge(edge.id)}
                onPaneClick={() => {
                  selectNode(undefined);
                  selectEdge(undefined);
                }}
              >
                <MiniMap pannable zoomable />
                <Controls />
                <Background color="#dbeafe" gap={20} />
              </ReactFlow>
            </div>
            <ValidationList issues={issues} />
          </section>
          <div className="space-y-4">
            <NodeInspector />
            <RunsPanel pipelineId={pipelineId} />
          </div>
        </div>
      )}
    </div>
  );
}

export function PipelineDesigner({ pipelineId }: { pipelineId: string }) {
  return (
    <ReactFlowProvider>
      <DesignerSurface pipelineId={pipelineId} />
    </ReactFlowProvider>
  );
}
