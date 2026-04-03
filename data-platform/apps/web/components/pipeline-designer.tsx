"use client";

import "reactflow/dist/style.css";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, type Connection, type Edge, type Node } from "reactflow";
import { Play, Rocket, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge, Button, Toolbar, ValidationList } from "@data-platform/ui";

import { getPipeline, publishPipeline, runPipeline, savePipeline, validatePipeline } from "@/lib/api";
import { NodeInspector } from "@/components/node-inspector";
import { NodePalette } from "@/components/node-palette";
import { RunsPanel } from "@/components/runs-panel";
import { useDesignerStore } from "@/stores/designer-store";

function DesignerSurface({ pipelineId }: { pipelineId: string }) {
  const router = useRouter();
  const spec = useDesignerStore((state) => state.spec);
  const dirty = useDesignerStore((state) => state.dirty);
  const issues = useDesignerStore((state) => state.issues);
  const selectedNodeId = useDesignerStore((state) => state.selectedNodeId);
  const selectedEdgeId = useDesignerStore((state) => state.selectedEdgeId);
  const loadSpec = useDesignerStore((state) => state.loadSpec);
  const addNodeToStore = useDesignerStore((state) => state.addNode);
  const connectNodes = useDesignerStore((state) => state.connectNodes);
  const updateNodePosition = useDesignerStore((state) => state.updateNodePosition);
  const selectNode = useDesignerStore((state) => state.selectNode);
  const selectEdge = useDesignerStore((state) => state.selectEdge);
  const deleteSelection = useDesignerStore((state) => state.deleteSelection);
  const validateLocal = useDesignerStore((state) => state.validate);
  const markClean = useDesignerStore((state) => state.markClean);

  const pipelineQuery = useQuery({
    queryKey: ["pipeline", pipelineId],
    queryFn: () => getPipeline(pipelineId)
  });

  useEffect(() => {
    if (pipelineQuery.data) {
      loadSpec(pipelineQuery.data.spec);
    }
  }, [loadSpec, pipelineQuery.data]);

  const rfNodes = useMemo<Node[]>(
    () =>
      spec.nodes.map((node) => ({
        id: node.id,
        position: node.position,
        data: {
          label: (
            <div className="rounded-[18px] bg-white px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">{node.name}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{node.type}</p>
            </div>
          )
        },
        style: {
          width: 220,
          borderRadius: 18,
          border: node.id === selectedNodeId ? "2px solid #0f766e" : "1px solid #cbd5e1",
          background: "#ffffff",
          boxShadow: "0 12px 24px rgba(15, 23, 42, 0.08)",
          padding: 0
        }
      })),
    [selectedNodeId, spec.nodes]
  );

  const rfEdges = useMemo<Edge[]>(
    () =>
      spec.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: false,
        style: { stroke: edge.id === selectedEdgeId ? "#0f766e" : "#475569", strokeWidth: 2 }
      })),
    [selectedEdgeId, spec.edges]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const record = pipelineQuery.data ?? {
        id: pipelineId,
        artifactId: "art_daily_sales",
        name: spec.name,
        description: spec.description,
        publishState: "draft" as const,
        currentVersion: spec.version,
        spec,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return savePipeline({ ...record, name: spec.name, description: spec.description, currentVersion: spec.version, spec });
    },
    onSuccess(saved) {
      loadSpec(saved.spec);
      markClean();
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

  return (
    <div className="space-y-4">
      <Toolbar>
        <div className="mr-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pipeline Designer</p>
          <h2 className="text-lg font-semibold text-slate-900">{spec.name}</h2>
        </div>
        <Badge>{dirty ? "Unsaved changes" : "Saved"}</Badge>
        <Button onClick={() => saveMutation.mutate()} className="rounded-full">
          <Save className="mr-2 h-4 w-4" />
          Save Draft
        </Button>
        <Button onClick={() => validateMutation.mutate()} className="rounded-full bg-slate-900 hover:bg-slate-800">
          <ShieldCheck className="mr-2 h-4 w-4" />
          Validate
        </Button>
        <Button onClick={() => publishMutation.mutate()} className="rounded-full bg-amber-500 text-slate-950 hover:bg-amber-400">
          <Rocket className="mr-2 h-4 w-4" />
          Publish
        </Button>
        <Button onClick={() => runMutation.mutate()} className="rounded-full bg-teal-700 hover:bg-teal-600">
          <Play className="mr-2 h-4 w-4" />
          Run
        </Button>
        <Button onClick={deleteSelection} className="rounded-full bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Selected
        </Button>
      </Toolbar>

      {(publishMutation.error || runMutation.error) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {(publishMutation.error as Error | null)?.message ?? (runMutation.error as Error | null)?.message}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <NodePalette onAdd={addNodeToStore} />
        <section className="grid min-h-[760px] gap-4 xl:grid-rows-[auto_minmax(0,1fr)_auto]">
          <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top Toolbar</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Design and validate production DAGs</h3>
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
