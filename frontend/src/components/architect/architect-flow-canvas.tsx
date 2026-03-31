"use client";

import { memo, useEffect, useMemo, useState } from "react";

import { Box, Button, Stack, Typography } from "@mui/material";
import ReactFlow, {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Panel,
  Position,
  ReactFlowProvider,
  type Connection,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeDragHandler,
  type NodeProps,
  type ReactFlowInstance
} from "reactflow";

import {
  CANVAS_HEIGHT,
  MIN_LANE_HEIGHT,
  MIN_LANE_WIDTH,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  MIN_ZONE_HEIGHT,
  MIN_ZONE_WIDTH,
  providerColors,
  providerLabels,
  type CanvasLane,
  type CanvasZone,
  type DiagramNode,
  type DiagramPlan,
  type DiagramStyle
} from "@/lib/architect-diagram";

export type CanvasSelection =
  | { kind: "none" }
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "zone"; id: string }
  | { kind: "lane"; id: string };

interface DiagramNodeData {
  title: string;
  subtitle: string;
  providerLabel: string;
  fill: string;
  stroke: string;
  text: string;
  titleFontSize: number;
  subtitleFontSize: number;
  metaFontSize: number;
  connectSource: boolean;
  onResizeEnd: (id: string, next: { x: number; y: number; width: number; height: number }) => void;
}

interface ZoneNodeData {
  label: string;
  fontSize: number;
  stroke: string;
  fill: string;
  onResizeEnd: (id: string, next: { x: number; y: number; width: number; height: number }) => void;
}

interface LaneNodeData {
  label: string;
  fontSize: number;
  fill: string;
  stroke: string;
  text: string;
  onResizeEnd: (id: string, next: { x: number; y: number; width: number; height: number }) => void;
}

interface ArchitectFlowCanvasProps {
  plan: DiagramPlan;
  diagramStyle: DiagramStyle;
  lanes: CanvasLane[];
  zones: CanvasZone[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedZoneId: string | null;
  selectedLaneId: string | null;
  connectFromId: string | null;
  canvasWidth: number;
  onSelectionChange: (selection: CanvasSelection) => void;
  onCreateEdge: (connection: { from: string; to: string }) => void;
  onNodeLayoutChange: (id: string, next: { x: number; y: number; width: number; height: number }) => void;
  onZoneLayoutChange: (id: string, next: { x: number; y: number; width: number; height: number }) => void;
  onLaneLayoutChange: (id: string, next: { x: number; y: number; width: number; height: number }) => void;
}

const edgeTypeByStyle: Record<DiagramStyle, "smoothstep" | "straight" | "step"> = {
  reference: "smoothstep",
  network: "straight",
  workflow: "step"
};

function clampPosition(x: number, y: number, width: number, height: number, canvasWidth: number) {
  return {
    x: Math.min(Math.max(x, 16), canvasWidth - width - 16),
    y: Math.min(Math.max(y, 16), CANVAS_HEIGHT - height - 16)
  };
}

const DiagramNodeView = memo(function DiagramNodeView({
  id,
  data,
  selected
}: NodeProps<DiagramNodeData>) {
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_NODE_WIDTH}
        minHeight={MIN_NODE_HEIGHT}
        color="#17315c"
        handleStyle={{ width: 12, height: 12, borderRadius: 4 }}
        lineStyle={{ borderWidth: 2 }}
        onResizeEnd={(_, params) => data.onResizeEnd(id, params)}
      />
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 10, height: 10, left: -6, background: "#17315c", border: "2px solid #ffffff" }}
      />
      <Box
        sx={{
          width: "100%",
          height: "100%",
          borderRadius: "18px",
          border: selected || data.connectSource ? "3px solid #17315c" : `2px solid ${data.stroke}`,
          bgcolor: data.fill,
          px: 2,
          py: 1.8,
          boxShadow: selected ? "0 18px 36px rgba(23, 49, 92, 0.14)" : "0 8px 18px rgba(23, 49, 92, 0.06)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between"
        }}
      >
        <Typography sx={{ fontSize: data.titleFontSize, lineHeight: 1.15, fontWeight: 700, color: "#17315c" }}>
          {data.title}
        </Typography>
        <Typography sx={{ fontSize: data.subtitleFontSize, lineHeight: 1.2, color: "#60779c" }}>
          {data.subtitle}
        </Typography>
        <Typography sx={{ fontSize: data.metaFontSize, lineHeight: 1.1, color: data.text, fontWeight: 700 }}>
          {data.providerLabel}
        </Typography>
      </Box>
      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 10, height: 10, right: -6, background: "#316fd6", border: "2px solid #ffffff" }}
      />
    </>
  );
});

const ZoneNodeView = memo(function ZoneNodeView({ id, data, selected }: NodeProps<ZoneNodeData>) {
  const labelWidth = Math.max(156, data.label.length * 7.2 + 28);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_ZONE_WIDTH}
        minHeight={MIN_ZONE_HEIGHT}
        color="#17315c"
        handleStyle={{ width: 12, height: 12, borderRadius: 4 }}
        lineStyle={{ borderWidth: 2 }}
        onResizeEnd={(_, params) => data.onResizeEnd(id, params)}
      />
      <Box
        sx={{
          width: "100%",
          height: "100%",
          borderRadius: "22px",
          border: selected ? "3px solid #17315c" : `2px dashed ${data.stroke}`,
          bgcolor: data.fill,
          px: 1.5,
          py: 1.2,
          boxShadow: selected ? "inset 0 0 0 1px rgba(23,49,92,0.08)" : "none"
        }}
      >
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            minWidth: labelWidth,
            maxWidth: "100%",
            px: 2,
            height: 32,
            borderRadius: 999,
            bgcolor: "rgba(255,255,255,0.96)",
            border: `1px solid ${data.stroke}33`
          }}
        >
          <Typography sx={{ fontSize: data.fontSize, lineHeight: 1, fontWeight: 700, color: "#17315c" }}>
            {data.label}
          </Typography>
        </Box>
      </Box>
    </>
  );
});

const LaneNodeView = memo(function LaneNodeView({ id, data, selected }: NodeProps<LaneNodeData>) {
  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_LANE_WIDTH}
        minHeight={MIN_LANE_HEIGHT}
        color="#17315c"
        handleStyle={{ width: 12, height: 12, borderRadius: 4 }}
        lineStyle={{ borderWidth: 2 }}
        onResizeEnd={(_, params) => data.onResizeEnd(id, params)}
      />
      <Box
        sx={{
          width: "100%",
          height: "100%",
          borderRadius: "24px",
          border: selected ? "3px solid #17315c" : `1px solid ${data.stroke}`,
          bgcolor: data.fill,
          px: 2.4,
          py: 1.8,
          boxShadow: selected ? "0 14px 28px rgba(23, 49, 92, 0.1)" : "none"
        }}
      >
        <Typography sx={{ fontSize: data.fontSize, fontWeight: 700, color: data.text }}>{data.label}</Typography>
      </Box>
    </>
  );
});

const nodeTypes = {
  diagram: DiagramNodeView,
  zone: ZoneNodeView,
  lane: LaneNodeView
};

function ArchitectFlowCanvasInner({
  plan,
  diagramStyle,
  lanes,
  zones,
  selectedNodeId,
  selectedEdgeId,
  selectedZoneId,
  selectedLaneId,
  connectFromId,
  canvasWidth,
  onSelectionChange,
  onCreateEdge,
  onNodeLayoutChange,
  onZoneLayoutChange,
  onLaneLayoutChange
}: ArchitectFlowCanvasProps) {
  const laneNodes = useMemo<FlowNode<LaneNodeData>[]>(() => {
    return lanes.map((lane) => ({
        id: lane.id,
        type: "lane",
        draggable: true,
        selectable: true,
        connectable: false,
        zIndex: 0,
        position: { x: lane.x, y: lane.y },
        style: { width: lane.width, height: lane.height },
        selected: lane.id === selectedLaneId,
        data: {
          label: lane.label,
          fontSize: lane.fontSize,
          fill: lane.fill,
          stroke: lane.stroke,
          text: lane.text,
          onResizeEnd: (id, next) => onLaneLayoutChange(id, next)
        }
      }));
  }, [lanes, onLaneLayoutChange, selectedLaneId]);

  const diagramNodes = useMemo<FlowNode<DiagramNodeData>[]>(() => {
    return plan.nodes.map((node) => {
      const palette = providerColors[node.provider];
      return {
        id: node.id,
        type: "diagram",
        position: { x: node.x, y: node.y },
        style: { width: node.width, height: node.height },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        selected: node.id === selectedNodeId,
        zIndex: 3,
        data: {
          title: node.title,
          subtitle: node.subtitle,
          providerLabel: node.provider === "shared" ? "SHARED" : providerLabels[node.provider],
          fill: palette.fill,
          stroke: palette.stroke,
          text: palette.text,
          titleFontSize: node.titleFontSize,
          subtitleFontSize: node.subtitleFontSize,
          metaFontSize: node.metaFontSize,
          connectSource: node.id === connectFromId,
          onResizeEnd: (id, next) => onNodeLayoutChange(id, next)
        }
      };
    });
  }, [connectFromId, onNodeLayoutChange, plan.nodes, selectedNodeId]);

  const zoneNodes = useMemo<FlowNode<ZoneNodeData>[]>(() => {
    return zones.map((zone) => ({
      id: zone.id,
      type: "zone",
      position: { x: zone.x, y: zone.y },
      style: { width: zone.width, height: zone.height },
      selected: zone.id === selectedZoneId,
      zIndex: 2,
      data: {
        label: zone.label,
        fontSize: zone.fontSize,
        stroke: zone.stroke,
        fill: zone.fill,
        onResizeEnd: (id, next) => onZoneLayoutChange(id, next)
      }
    }));
  }, [onZoneLayoutChange, selectedZoneId, zones]);

  const mappedEdges = useMemo<FlowEdge[]>(() => {
    return plan.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      type: edgeTypeByStyle[diagramStyle],
      animated: diagramStyle === "workflow",
      selected: edge.id === selectedEdgeId,
      style: {
        stroke: edge.id === selectedEdgeId ? "#17315c" : "#316fd6",
        strokeWidth: edge.id === selectedEdgeId ? 4 : 3
      },
      labelStyle: { fill: "#60779c", fontSize: 12, fontWeight: 600 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: edge.id === selectedEdgeId ? "#17315c" : "#316fd6"
      }
    }));
  }, [diagramStyle, plan.edges, selectedEdgeId]);

  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([...laneNodes, ...zoneNodes, ...diagramNodes]);
  const [flowEdges, setFlowEdges] = useState<FlowEdge[]>(mappedEdges);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);

  useEffect(() => {
    setFlowNodes([...laneNodes, ...zoneNodes, ...diagramNodes]);
  }, [diagramNodes, laneNodes, zoneNodes]);

  useEffect(() => {
    setFlowEdges(mappedEdges);
  }, [mappedEdges]);

  const handleNodeDragStop: NodeDragHandler = (_, node) => {
    const width = Number(node.width ?? node.style?.width ?? MIN_NODE_WIDTH);
    const height = Number(node.height ?? node.style?.height ?? MIN_NODE_HEIGHT);
    const next = clampPosition(node.position.x, node.position.y, width, height, canvasWidth);

    if (node.type === "diagram") {
      onNodeLayoutChange(node.id, { x: next.x, y: next.y, width, height });
      return;
    }

    if (node.type === "zone") {
      onZoneLayoutChange(node.id, { x: next.x, y: next.y, width, height });
      return;
    }

    if (node.type === "lane") {
      onLaneLayoutChange(node.id, {
        x: next.x,
        y: next.y,
        width: Math.max(width, MIN_LANE_WIDTH),
        height: Math.max(height, MIN_LANE_HEIGHT)
      });
    }
  };

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return;
    }

    onCreateEdge({ from: connection.source, to: connection.target });
  }

  return (
    <Box sx={{ width: "100%", height: 760, borderRadius: 4, overflow: "hidden", bgcolor: "#f8fbff" }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onInit={setFlowInstance}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={(event, node) => {
          event.preventDefault();

          if (node.type === "zone") {
            onSelectionChange({ kind: "zone", id: node.id });
            return;
          }

          if (node.type === "lane") {
            onSelectionChange({ kind: "lane", id: node.id });
            return;
          }

          if (node.type !== "diagram") {
            return;
          }

          if (connectFromId && connectFromId !== node.id) {
            onCreateEdge({ from: connectFromId, to: node.id });
            onSelectionChange({ kind: "node", id: node.id });
            return;
          }

          onSelectionChange({ kind: "node", id: node.id });
        }}
        onEdgeClick={(event, edge) => {
          event.preventDefault();
          onSelectionChange({ kind: "edge", id: edge.id });
        }}
        onPaneClick={() => onSelectionChange({ kind: "none" })}
        onConnect={handleConnect}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.6}
        defaultEdgeOptions={{
          type: edgeTypeByStyle[diagramStyle],
          markerEnd: { type: MarkerType.ArrowClosed, color: "#316fd6" }
        }}
        connectionMode={ConnectionMode.Loose}
        snapToGrid
        snapGrid={[16, 16]}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="rgba(49, 111, 214, 0.08)" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => {
            if (node.type === "zone") {
              return "#d7e6ff";
            }

            if (node.type === "lane") {
              return "#eef4ff";
            }

            const provider = (node.data as DiagramNodeData).providerLabel;
            if (provider === "SHARED") {
              return providerColors.shared.stroke;
            }

            const entry = Object.entries(providerLabels).find(([, label]) => label === provider);
            return entry ? providerColors[entry[0] as keyof typeof providerColors].stroke : "#316fd6";
          }}
        />
        <Controls showInteractive={false} />
        <Panel position="top-right">
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => flowInstance?.fitView({ padding: 0.18, duration: 220 })}
              sx={{ bgcolor: "rgba(255,255,255,0.94)", borderColor: "var(--line)", color: "var(--text)" }}
            >
              Fit Diagram
            </Button>
          </Stack>
        </Panel>
      </ReactFlow>
    </Box>
  );
}

export function ArchitectFlowCanvas(props: ArchitectFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <ArchitectFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
