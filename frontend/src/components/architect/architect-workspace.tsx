"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";

import {
  loadArchitectCanvasDraft,
  clearPendingArchitectScenario,
  loadPendingArchitectScenario,
  storeArchitectCanvasDraft
} from "@/lib/scenario-store";
import { ArchitectFlowCanvas, type CanvasSelection } from "@/components/architect/architect-flow-canvas";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_ARCHITECT_PROVIDERS,
  MIN_LANE_FONT_SIZE,
  MIN_LANE_HEIGHT,
  MIN_LANE_WIDTH,
  MIN_META_FONT_SIZE,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
  MIN_SUBTITLE_FONT_SIZE,
  MIN_TITLE_FONT_SIZE,
  buildCanvasLanes,
  MIN_ZONE_FONT_SIZE,
  MIN_ZONE_HEIGHT,
  MIN_ZONE_WIDTH,
  PROVIDER_LANE_START,
  architectureProviderOptions,
  buildAgentMessage,
  buildArchitecturePlan,
  buildArchitectureSvg,
  buildCanvasZones,
  buildManualNodeTitle,
  buildNode,
  buildPromptFromRequest,
  categoryOptions,
  createId,
  detectProviders,
  findNextPosition,
  getCategoryLabel,
  getLegendItems,
  getProviderLaneWidth,
  providerLabels,
  quickPrompts,
  type ArchitectureCloudProvider,
  type CanvasLane,
  type CanvasZone,
  type DiagramCategory,
  type DiagramNode,
  type DiagramPlan,
  type DiagramProvider,
  type DiagramStyle
} from "@/lib/architect-diagram";
import type { RecommendationRequest } from "@/lib/types";

interface ArchitectWorkspaceProps {
  canvasOnly?: boolean;
}

export function ArchitectWorkspace({ canvasOnly = false }: ArchitectWorkspaceProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(quickPrompts[0]);
  const [selectedProviders, setSelectedProviders] = useState<ArchitectureCloudProvider[]>(DEFAULT_ARCHITECT_PROVIDERS);
  const [requestContext, setRequestContext] = useState<RecommendationRequest | null>(null);
  const [plan, setPlan] = useState<DiagramPlan>(() =>
    buildArchitecturePlan(quickPrompts[0], DEFAULT_ARCHITECT_PROVIDERS, null, "reference")
  );
  const [agentMessage, setAgentMessage] = useState(buildAgentMessage(plan));
  const [diagramStyle, setDiagramStyle] = useState<DiagramStyle>("reference");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [manualProvider, setManualProvider] = useState<DiagramProvider>("shared");
  const [manualCategory, setManualCategory] = useState<DiagramCategory>("compute");
  const [manualTitle, setManualTitle] = useState("");
  const [manualSubtitle, setManualSubtitle] = useState("");
  const [zoneOverrides, setZoneOverrides] = useState<Record<string, Partial<CanvasZone>>>({});
  const [laneOverrides, setLaneOverrides] = useState<Record<string, Partial<CanvasLane>>>({});
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();

  useEffect(() => {
    if (canvasOnly) {
      const draft = loadArchitectCanvasDraft();
      if (!draft) {
        return;
      }

      setPrompt(draft.prompt);
      setSelectedProviders(draft.selected_providers as ArchitectureCloudProvider[]);
      setDiagramStyle((draft.diagram_style as DiagramStyle | undefined) ?? "reference");
      setRequestContext(draft.request_context);
      setPlan(draft.plan as unknown as DiagramPlan);
      setZoneOverrides((draft.zone_overrides as Record<string, Partial<CanvasZone>> | undefined) ?? {});
      setLaneOverrides((draft.lane_overrides as Record<string, Partial<CanvasLane>> | undefined) ?? {});
      setAgentMessage(buildAgentMessage(draft.plan as unknown as DiagramPlan));
      return;
    }

    const pendingScenario = loadPendingArchitectScenario();
    if (!pendingScenario) {
      return;
    }

    const nextPrompt =
      pendingScenario.prompt_override ?? buildPromptFromRequest(pendingScenario.request, pendingScenario.name);
    const nextPlan = buildArchitecturePlan(
      nextPrompt,
      pendingScenario.request.preferred_providers,
      pendingScenario.request,
      diagramStyle
    );

    setPrompt(nextPrompt);
    setSelectedProviders(nextPlan.providers);
    setRequestContext(pendingScenario.request);
    setPlan(nextPlan);
    setZoneOverrides({});
    setLaneOverrides({});
    setAgentMessage(buildAgentMessage(nextPlan));
    setImportMessage(`Imported "${pendingScenario.name}" into Agent Architect.`);
    clearPendingArchitectScenario();
  }, [canvasOnly, diagramStyle]);

  const nodeLookup = useMemo(() => {
    return plan.nodes.reduce<Record<string, DiagramNode>>((accumulator, node) => {
      accumulator[node.id] = node;
      return accumulator;
    }, {});
  }, [plan.nodes]);

  const selectedNode = selectedNodeId ? nodeLookup[selectedNodeId] ?? null : null;
  const selectedEdge = selectedEdgeId ? plan.edges.find((edge) => edge.id === selectedEdgeId) ?? null : null;
  const laneWidth = getProviderLaneWidth(plan.providers.length);
  const canvasWidth = Math.max(CANVAS_WIDTH, PROVIDER_LANE_START + plan.providers.length * laneWidth + 60);
  const displayedCanvasLanes = useMemo(
    () => buildCanvasLanes(plan, diagramStyle, laneOverrides),
    [diagramStyle, laneOverrides, plan]
  );
  const canvasZones = useMemo(() => buildCanvasZones(plan, diagramStyle), [diagramStyle, plan]);
  const displayedCanvasZones = useMemo(() => buildCanvasZones(plan, diagramStyle, zoneOverrides), [diagramStyle, plan, zoneOverrides]);
  const selectedZone: CanvasZone | null = selectedZoneId
    ? displayedCanvasZones.find((zone) => zone.id === selectedZoneId) ?? null
    : null;
  const selectedLane: CanvasLane | null = selectedLaneId
    ? displayedCanvasLanes.find((lane) => lane.id === selectedLaneId) ?? null
    : null;
  const legendItems = useMemo(() => getLegendItems(diagramStyle), [diagramStyle]);

  function clampCanvasLayout(x: number, y: number, width: number, height: number) {
    return {
      x: Math.min(Math.max(x, 16), canvasWidth - width - 16),
      y: Math.min(Math.max(y, 16), CANVAS_HEIGHT - height - 16)
    };
  }

  function regenerateDiagram(nextPrompt = prompt, nextProviders = selectedProviders, nextRequest = requestContext) {
    setImportMessage(null);
    setAgentMessage("Generating architecture diagram...");
    startGenerating(() => {
      const nextPlan = buildArchitecturePlan(nextPrompt, nextProviders, nextRequest, diagramStyle);
      setPlan(nextPlan);
      setSelectedProviders(nextPlan.providers);
      setZoneOverrides({});
      setLaneOverrides({});
      setAgentMessage(buildAgentMessage(nextPlan));
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSelectedZoneId(null);
      setSelectedLaneId(null);
      setConnectFromId(null);
    });
  }

  function toggleProvider(provider: ArchitectureCloudProvider) {
    setSelectedProviders((current) => {
      if (current.includes(provider)) {
        return current.length === 1 ? current : current.filter((item) => item !== provider);
      }

      return [...current, provider];
    });
  }

  useEffect(() => {
    const validZoneIds = new Set(canvasZones.map((zone) => zone.id));
    setZoneOverrides((current) =>
      Object.fromEntries(Object.entries(current).filter(([zoneId]) => validZoneIds.has(zoneId)))
    );
    if (selectedZoneId && !validZoneIds.has(selectedZoneId)) {
      setSelectedZoneId(null);
    }
  }, [canvasZones, selectedZoneId]);

  useEffect(() => {
    const validLaneIds = new Set(displayedCanvasLanes.map((lane) => lane.id));
    setLaneOverrides((current) =>
      Object.fromEntries(Object.entries(current).filter(([laneId]) => validLaneIds.has(laneId)))
    );
    if (selectedLaneId && !validLaneIds.has(selectedLaneId)) {
      setSelectedLaneId(null);
    }
  }, [displayedCanvasLanes, selectedLaneId]);

  function handleCreateEdge(connection: { from: string; to: string }) {
    setPlan((current) => ({
      ...current,
      edges: [...current.edges, { id: createId("edge"), from: connection.from, to: connection.to }]
    }));
    setConnectFromId(null);
    setSelectedNodeId(connection.to);
    setSelectedEdgeId(null);
    setSelectedZoneId(null);
    setSelectedLaneId(null);
  }

  function handleNodeLayoutChange(id: string, next: { x: number; y: number; width: number; height: number }) {
    setPlan((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              ...clampCanvasLayout(
                next.x,
                next.y,
                Math.max(next.width, MIN_NODE_WIDTH),
                Math.max(next.height, MIN_NODE_HEIGHT)
              ),
              width: Math.min(Math.max(next.width, MIN_NODE_WIDTH), canvasWidth - 32),
              height: Math.min(Math.max(next.height, MIN_NODE_HEIGHT), CANVAS_HEIGHT - 32)
            }
          : node
      )
    }));
  }

  function handleZoneLayoutChange(id: string, next: { x: number; y: number; width: number; height: number }) {
    setZoneOverrides((current) => {
      const width = Math.min(Math.max(next.width, MIN_ZONE_WIDTH), canvasWidth - 32);
      const height = Math.min(Math.max(next.height, MIN_ZONE_HEIGHT), CANVAS_HEIGHT - 32);
      const position = clampCanvasLayout(next.x, next.y, width, height);

      return {
        ...current,
        [id]: {
          ...(current[id] ?? {}),
          x: position.x,
          y: position.y,
          width,
          height
        }
      };
    });
  }

  function handleLaneLayoutChange(id: string, next: { x: number; y: number; width: number; height: number }) {
    setLaneOverrides((current) => {
      const width = Math.min(Math.max(next.width, MIN_LANE_WIDTH), canvasWidth - 32);
      const height = Math.min(Math.max(next.height, MIN_LANE_HEIGHT), CANVAS_HEIGHT - 32);
      const position = clampCanvasLayout(next.x, next.y, width, height);

      return {
        ...current,
        [id]: {
          ...(current[id] ?? {}),
          x: position.x,
          y: position.y,
          width,
          height
        }
      };
    });
  }

  function handleAddNode() {
    const position = findNextPosition(plan.nodes.length);
    const node = buildNode(
      buildManualNodeTitle(manualProvider, manualCategory, manualTitle),
      manualSubtitle.trim() || "Custom architecture element",
      manualProvider,
      manualCategory,
      position.x,
      position.y
    );

    setPlan((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setSelectedZoneId(null);
    setSelectedLaneId(null);
    setManualTitle("");
    setManualSubtitle("");
  }

  function handleDeleteSelection() {
    if (selectedNodeId) {
      setPlan((current) => ({
        ...current,
        nodes: current.nodes.filter((node) => node.id !== selectedNodeId),
        edges: current.edges.filter((edge) => edge.from !== selectedNodeId && edge.to !== selectedNodeId)
      }));
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setConnectFromId(null);
      return;
    }

    if (selectedEdgeId) {
      setPlan((current) => ({
        ...current,
        edges: current.edges.filter((edge) => edge.id !== selectedEdgeId)
      }));
      setSelectedEdgeId(null);
    }
  }

  function updateSelectedNodeField<Key extends keyof DiagramNode>(field: Key, value: DiagramNode[Key]) {
    if (!selectedNodeId) {
      return;
    }

    setPlan((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === selectedNodeId ? { ...node, [field]: value } : node))
    }));
  }

  function updateSelectedNodeLayout(field: "x" | "y" | "width" | "height", value: string) {
    if (!selectedNodeId) {
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const target = nodeLookup[selectedNodeId];
    if (!target) {
      return;
    }

    handleNodeLayoutChange(selectedNodeId, {
      x: field === "x" ? numericValue : target.x,
      y: field === "y" ? numericValue : target.y,
      width: field === "width" ? numericValue : target.width,
      height: field === "height" ? numericValue : target.height
    });
  }

  function updateSelectedNodeFontSize(
    field: "titleFontSize" | "subtitleFontSize" | "metaFontSize",
    value: string
  ) {
    if (!selectedNodeId) {
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const minimum =
      field === "titleFontSize"
        ? MIN_TITLE_FONT_SIZE
        : field === "subtitleFontSize"
          ? MIN_SUBTITLE_FONT_SIZE
          : MIN_META_FONT_SIZE;

    setPlan((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              [field]: Math.max(numericValue, minimum)
            }
          : node
      )
    }));
  }

  function updateSelectedEdgeLabel(value: string) {
    if (!selectedEdgeId) {
      return;
    }

    setPlan((current) => ({
      ...current,
      edges: current.edges.map((edge) =>
        edge.id === selectedEdgeId
          ? {
              ...edge,
              label: value.trim() ? value : undefined
            }
          : edge
      )
    }));
  }

  function updateSelectedZoneField(field: "label" | "fontSize" | "x" | "y" | "width" | "height", value: string) {
    if (!selectedZoneId) {
      return;
    }

    setZoneOverrides((current) => {
      const next = { ...(current[selectedZoneId] ?? {}) };

      if (field === "label") {
        next.label = value;
      } else {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          return current;
        }

        if (field === "fontSize") {
          next.fontSize = Math.max(numericValue, MIN_ZONE_FONT_SIZE);
        } else {
          const baseZone = displayedCanvasZones.find((zone) => zone.id === selectedZoneId);
          const width = field === "width" ? numericValue : (next.width ?? baseZone?.width ?? MIN_ZONE_WIDTH);
          const height = field === "height" ? numericValue : (next.height ?? baseZone?.height ?? MIN_ZONE_HEIGHT);
          const x = field === "x" ? numericValue : (next.x ?? baseZone?.x ?? 16);
          const y = field === "y" ? numericValue : (next.y ?? baseZone?.y ?? 16);
          const position = clampCanvasLayout(
            x,
            y,
            Math.max(width, MIN_ZONE_WIDTH),
            Math.max(height, MIN_ZONE_HEIGHT)
          );

          next.x = position.x;
          next.y = position.y;
          next.width = Math.min(Math.max(width, MIN_ZONE_WIDTH), canvasWidth - 32);
          next.height = Math.min(Math.max(height, MIN_ZONE_HEIGHT), CANVAS_HEIGHT - 32);
        }
      }

      return {
        ...current,
        [selectedZoneId]: next
      };
    });
  }

  function updateSelectedLaneField(field: "label" | "fontSize" | "x" | "y" | "width" | "height", value: string) {
    if (!selectedLaneId) {
      return;
    }

    setLaneOverrides((current) => {
      const next = { ...(current[selectedLaneId] ?? {}) };

      if (field === "label") {
        next.label = value;
      } else {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          return current;
        }

        if (field === "fontSize") {
          next.fontSize = Math.max(numericValue, MIN_LANE_FONT_SIZE);
        } else {
          const baseLane = displayedCanvasLanes.find((lane) => lane.id === selectedLaneId);
          const width = field === "width" ? numericValue : (next.width ?? baseLane?.width ?? MIN_LANE_WIDTH);
          const height = field === "height" ? numericValue : (next.height ?? baseLane?.height ?? MIN_LANE_HEIGHT);
          const x = field === "x" ? numericValue : (next.x ?? baseLane?.x ?? 16);
          const y = field === "y" ? numericValue : (next.y ?? baseLane?.y ?? 16);
          const position = clampCanvasLayout(
            x,
            y,
            Math.max(width, MIN_LANE_WIDTH),
            Math.max(height, MIN_LANE_HEIGHT)
          );

          next.x = position.x;
          next.y = position.y;
          next.width = Math.min(Math.max(width, MIN_LANE_WIDTH), canvasWidth - 32);
          next.height = Math.min(Math.max(height, MIN_LANE_HEIGHT), CANVAS_HEIGHT - 32);
        }
      }

      return {
        ...current,
        [selectedLaneId]: next
      };
    });
  }

  function updatePlanField(field: "title" | "summary", value: string) {
    setPlan((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateAssumption(index: number, value: string) {
    setPlan((current) => ({
      ...current,
      assumptions: current.assumptions.map((assumption, assumptionIndex) =>
        assumptionIndex === index ? value : assumption
      )
    }));
  }

  function addAssumption() {
    setPlan((current) => ({
      ...current,
      assumptions: [...current.assumptions, "New architecture assumption"]
    }));
  }

  function removeAssumption(index: number) {
    setPlan((current) => ({
      ...current,
      assumptions:
        current.assumptions.length === 1
          ? current.assumptions
          : current.assumptions.filter((_, assumptionIndex) => assumptionIndex !== index)
    }));
  }

  function downloadSvg() {
    const source = buildArchitectureSvg(plan, diagramStyle, displayedCanvasZones, displayedCanvasLanes, canvasWidth);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cloudsizer-architecture.svg";
    link.click();
    URL.revokeObjectURL(url);
  }

  function openCanvasPage() {
    storeArchitectCanvasDraft({
      prompt,
      selected_providers: selectedProviders,
      diagram_style: diagramStyle,
      request_context: requestContext,
      plan: plan as unknown as Record<string, unknown>,
      zone_overrides: zoneOverrides,
      lane_overrides: laneOverrides,
      saved_at: new Date().toISOString()
    });
    router.push("/architect/canvas");
  }

  function handleCanvasSelection(selection: CanvasSelection) {
    if (selection.kind === "node") {
      setSelectedNodeId(selection.id);
      setSelectedEdgeId(null);
      setSelectedZoneId(null);
      setSelectedLaneId(null);
      return;
    }

    if (selection.kind === "edge") {
      setSelectedEdgeId(selection.id);
      setSelectedNodeId(null);
      setSelectedZoneId(null);
      setSelectedLaneId(null);
      return;
    }

    if (selection.kind === "zone") {
      setSelectedZoneId(selection.id);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSelectedLaneId(null);
      return;
    }

    if (selection.kind === "lane") {
      setSelectedLaneId(selection.id);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setSelectedZoneId(null);
      return;
    }

    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedZoneId(null);
    setSelectedLaneId(null);
  }

  function renderSelectionEditor() {
    if (selectedNode) {
      return (
        <>
          <TextField
            label="Selected node title"
            value={selectedNode.title}
            onChange={(event) => updateSelectedNodeField("title", event.target.value)}
          />
          <TextField
            label="Selected node subtitle"
            value={selectedNode.subtitle}
            onChange={(event) => updateSelectedNodeField("subtitle", event.target.value)}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Node X"
              type="number"
              value={Math.round(selectedNode.x)}
              onChange={(event) => updateSelectedNodeLayout("x", event.target.value)}
              inputProps={{ step: 1 }}
              fullWidth
            />
            <TextField
              label="Node Y"
              type="number"
              value={Math.round(selectedNode.y)}
              onChange={(event) => updateSelectedNodeLayout("y", event.target.value)}
              inputProps={{ step: 1 }}
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Node width"
              type="number"
              value={Math.round(selectedNode.width)}
              onChange={(event) => updateSelectedNodeLayout("width", event.target.value)}
              inputProps={{ min: MIN_NODE_WIDTH, step: 1 }}
              fullWidth
            />
            <TextField
              label="Node height"
              type="number"
              value={Math.round(selectedNode.height)}
              onChange={(event) => updateSelectedNodeLayout("height", event.target.value)}
              inputProps={{ min: MIN_NODE_HEIGHT, step: 1 }}
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Title font"
              type="number"
              value={selectedNode.titleFontSize}
              onChange={(event) => updateSelectedNodeFontSize("titleFontSize", event.target.value)}
              inputProps={{ min: MIN_TITLE_FONT_SIZE, step: 0.5 }}
              fullWidth
            />
            <TextField
              label="Subtitle font"
              type="number"
              value={selectedNode.subtitleFontSize}
              onChange={(event) => updateSelectedNodeFontSize("subtitleFontSize", event.target.value)}
              inputProps={{ min: MIN_SUBTITLE_FONT_SIZE, step: 0.5 }}
              fullWidth
            />
            <TextField
              label="Meta font"
              type="number"
              value={selectedNode.metaFontSize}
              onChange={(event) => updateSelectedNodeFontSize("metaFontSize", event.target.value)}
              inputProps={{ min: MIN_META_FONT_SIZE, step: 0.5 }}
              fullWidth
            />
          </Stack>
          <FormControl fullWidth>
            <InputLabel id="selected-node-provider-label">Selected node provider</InputLabel>
            <Select
              labelId="selected-node-provider-label"
              value={selectedNode.provider}
              label="Selected node provider"
              onChange={(event) => updateSelectedNodeField("provider", event.target.value as DiagramProvider)}
            >
              <MenuItem value="shared">Shared</MenuItem>
              {architectureProviderOptions.map((provider) => (
                <MenuItem key={provider} value={provider}>
                  {providerLabels[provider]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel id="selected-node-category-label">Selected node category</InputLabel>
            <Select
              labelId="selected-node-category-label"
              value={selectedNode.category}
              label="Selected node category"
              onChange={(event) => updateSelectedNodeField("category", event.target.value as DiagramCategory)}
            >
              {categoryOptions.map((category) => (
                <MenuItem key={category} value={category}>
                  {getCategoryLabel(category)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
            Provider: {selectedNode.provider === "shared" ? "Shared" : providerLabels[selectedNode.provider]} | Category:{" "}
            {getCategoryLabel(selectedNode.category)}
          </Typography>
        </>
      );
    }

    if (selectedZone) {
      return (
        <>
          <TextField
            label="Zone label"
            value={selectedZone.label}
            onChange={(event) => updateSelectedZoneField("label", event.target.value)}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Zone X"
              type="number"
              value={Math.round(selectedZone.x)}
              onChange={(event) => updateSelectedZoneField("x", event.target.value)}
              inputProps={{ step: 1 }}
              fullWidth
            />
            <TextField
              label="Zone Y"
              type="number"
              value={Math.round(selectedZone.y)}
              onChange={(event) => updateSelectedZoneField("y", event.target.value)}
              inputProps={{ step: 1 }}
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Zone width"
              type="number"
              value={Math.round(selectedZone.width)}
              onChange={(event) => updateSelectedZoneField("width", event.target.value)}
              inputProps={{ min: MIN_ZONE_WIDTH, step: 1 }}
              fullWidth
            />
            <TextField
              label="Zone height"
              type="number"
              value={Math.round(selectedZone.height)}
              onChange={(event) => updateSelectedZoneField("height", event.target.value)}
              inputProps={{ min: MIN_ZONE_HEIGHT, step: 1 }}
              fullWidth
            />
          </Stack>
          <TextField
            label="Zone font"
            type="number"
            value={selectedZone.fontSize}
            onChange={(event) => updateSelectedZoneField("fontSize", event.target.value)}
            inputProps={{ min: MIN_ZONE_FONT_SIZE, step: 0.5 }}
          />
        </>
      );
    }

    if (selectedLane) {
      return (
        <>
          <TextField
            label="Lane label"
            value={selectedLane.label}
            onChange={(event) => updateSelectedLaneField("label", event.target.value)}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Lane X"
              type="number"
              value={Math.round(selectedLane.x)}
              onChange={(event) => updateSelectedLaneField("x", event.target.value)}
              inputProps={{ step: 1 }}
              fullWidth
            />
            <TextField
              label="Lane Y"
              type="number"
              value={Math.round(selectedLane.y)}
              onChange={(event) => updateSelectedLaneField("y", event.target.value)}
              inputProps={{ step: 1 }}
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Lane width"
              type="number"
              value={Math.round(selectedLane.width)}
              onChange={(event) => updateSelectedLaneField("width", event.target.value)}
              inputProps={{ min: MIN_LANE_WIDTH, step: 1 }}
              fullWidth
            />
            <TextField
              label="Lane height"
              type="number"
              value={Math.round(selectedLane.height)}
              onChange={(event) => updateSelectedLaneField("height", event.target.value)}
              inputProps={{ min: MIN_LANE_HEIGHT, step: 1 }}
              fullWidth
            />
          </Stack>
          <TextField
            label="Lane font"
            type="number"
            value={selectedLane.fontSize}
            onChange={(event) => updateSelectedLaneField("fontSize", event.target.value)}
            inputProps={{ min: MIN_LANE_FONT_SIZE, step: 0.5 }}
          />
          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
            Lane provider: {selectedLane.provider === "shared" ? "Shared" : providerLabels[selectedLane.provider]}.
          </Typography>
        </>
      );
    }

    if (selectedEdge) {
      return (
        <>
          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
            Edge selected between {nodeLookup[selectedEdge.from]?.title ?? "source"} and{" "}
            {nodeLookup[selectedEdge.to]?.title ?? "target"}.
          </Typography>
          <TextField
            label="Edge label"
            value={selectedEdge.label ?? ""}
            onChange={(event) => updateSelectedEdgeLabel(event.target.value)}
            helperText="Optional label shown on the connector."
          />
        </>
      );
    }

    return (
      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
        Select a node, lane, zone, or edge to edit it.
      </Typography>
    );
  }

  if (canvasOnly) {
    return (
      <Box sx={{ py: { xs: 3, md: 4 }, minHeight: "100vh" }}>
        <Container maxWidth={false} sx={{ px: { xs: 2, md: 4 } }}>
          <Stack spacing={3}>
            <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none", background: "var(--hero)" }}>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
                  <Box>
                    <Typography variant="overline" sx={{ color: "var(--muted)", letterSpacing: "0.12em" }}>
                      Agent Architect Canvas
                    </Typography>
                    <Typography variant="h4" sx={{ mt: 0.5 }}>
                      Full-page diagram editor
                    </Typography>
                    <Typography variant="body2" sx={{ color: "var(--muted)", mt: 1 }}>
                      Edit the current architecture draft on a dedicated page, then return to the workspace when done.
                    </Typography>
                  </Box>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <Button component={Link} href="/architect" variant="outlined" sx={{ borderColor: "var(--line)", color: "var(--text)" }}>
                      Back To Workspace
                    </Button>
                    <Button variant="outlined" onClick={downloadSvg} sx={{ borderColor: "var(--line)", color: "var(--text)" }}>
                      Export SVG
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Grid container spacing={3}>
              <Grid item xs={12} xl={3} sx={{ order: { xs: 1, xl: 3 } }}>
                <Stack spacing={3}>
                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2}>
                        <Typography variant="h6">Architect Assistant</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Describe the target architecture and choose the diagram style. The assistant will generate
                          layered component views closer to the reference diagrams you shared.
                        </Typography>
                        <TextField
                          label="Architecture brief"
                          multiline
                          minRows={6}
                          value={prompt}
                          onChange={(event) => setPrompt(event.target.value)}
                        />
                        <FormControl fullWidth>
                          <InputLabel id="diagram-style-label">Diagram style</InputLabel>
                          <Select
                            labelId="diagram-style-label"
                            value={diagramStyle}
                            label="Diagram style"
                            onChange={(event) => setDiagramStyle(event.target.value as DiagramStyle)}
                          >
                            <MenuItem value="reference">Reference architecture</MenuItem>
                            <MenuItem value="network">Network topology</MenuItem>
                            <MenuItem value="workflow">Workflow diagram</MenuItem>
                          </Select>
                        </FormControl>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {quickPrompts.map((item) => (
                            <Chip
                              key={item}
                              label={item}
                              onClick={() => {
                                setPrompt(item);
                                setSelectedProviders(detectProviders(item, selectedProviders));
                              }}
                              sx={{ maxWidth: "100%", bgcolor: "var(--panel-soft)", border: "1px solid var(--line)" }}
                            />
                          ))}
                        </Stack>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {architectureProviderOptions.map((provider) => (
                            <Chip
                              key={provider}
                              label={providerLabels[provider]}
                              onClick={() => toggleProvider(provider)}
                              sx={{
                                fontWeight: 700,
                                border: "1px solid",
                                borderColor: selectedProviders.includes(provider) ? "var(--line-strong)" : "var(--line)",
                                bgcolor: selectedProviders.includes(provider) ? "var(--accent-soft)" : "transparent"
                              }}
                            />
                          ))}
                        </Stack>
                        <Button
                          variant="contained"
                          onClick={() => regenerateDiagram()}
                          disabled={isGenerating}
                          sx={{ bgcolor: "var(--accent)", color: "#ffffff", "&:hover": { bgcolor: "#265db8" } }}
                        >
                          {isGenerating ? "Generating..." : "Generate Assisted Diagram"}
                        </Button>
                        <Alert severity="info">{agentMessage}</Alert>
                      </Stack>
                    </CardContent>
                  </Card>
                </Stack>
              </Grid>

              <Grid item xs={12} xl={6} sx={{ order: { xs: 2, xl: 2 } }}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: { xs: 1.5, md: 2.5 } }}>
                    <ArchitectFlowCanvas
                      plan={plan}
                      diagramStyle={diagramStyle}
                      lanes={displayedCanvasLanes}
                      zones={displayedCanvasZones}
                      selectedNodeId={selectedNodeId}
                      selectedEdgeId={selectedEdgeId}
                      selectedZoneId={selectedZoneId}
                      selectedLaneId={selectedLaneId}
                      connectFromId={connectFromId}
                      canvasWidth={canvasWidth}
                      onSelectionChange={handleCanvasSelection}
                      onCreateEdge={handleCreateEdge}
                      onNodeLayoutChange={handleNodeLayoutChange}
                      onZoneLayoutChange={handleZoneLayoutChange}
                      onLaneLayoutChange={handleLaneLayoutChange}
                    />
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} xl={3} sx={{ order: { xs: 3, xl: 1 } }}>
                <Stack spacing={3}>
                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={1.5}>
                        <Typography variant="h6">Tools Panel</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          Use these tools like a lightweight Lucidchart sidebar: create services, connect them,
                          and refine the current diagram.
                        </Typography>
                        <Alert severity="info">
                          Drag nodes, zones, and lanes on the canvas to move them. Select any visible element to edit
                          its label, size, or position. To create a link, select a node, click connect mode, then
                          click the target node.
                        </Alert>
                        <FormControl fullWidth>
                          <InputLabel id="canvas-manual-provider-label">Node provider</InputLabel>
                          <Select
                            labelId="canvas-manual-provider-label"
                            value={manualProvider}
                            label="Node provider"
                            onChange={(event) => setManualProvider(event.target.value as DiagramProvider)}
                          >
                            <MenuItem value="shared">Shared</MenuItem>
                            {architectureProviderOptions.map((provider) => (
                              <MenuItem key={provider} value={provider}>
                                {providerLabels[provider]}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl fullWidth>
                          <InputLabel id="canvas-manual-category-label">Node category</InputLabel>
                          <Select
                            labelId="canvas-manual-category-label"
                            value={manualCategory}
                            label="Node category"
                            onChange={(event) => setManualCategory(event.target.value as DiagramCategory)}
                          >
                            {categoryOptions.map((category) => (
                              <MenuItem key={category} value={category}>
                                {getCategoryLabel(category)}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <TextField label="Node title" value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} />
                        <TextField label="Node subtitle" value={manualSubtitle} onChange={(event) => setManualSubtitle(event.target.value)} />
                        <Button
                          variant="contained"
                          onClick={handleAddNode}
                          sx={{ bgcolor: "#17315c", color: "#ffffff", "&:hover": { bgcolor: "#102443" } }}
                        >
                          Add Tool Shape
                        </Button>
                        <Button
                          variant={connectFromId ? "contained" : "outlined"}
                          onClick={() => setConnectFromId((current) => (current ? null : selectedNodeId))}
                          disabled={!selectedNodeId && !connectFromId}
                          sx={{ borderColor: "var(--line)", color: connectFromId ? "#ffffff" : "var(--text)", bgcolor: connectFromId ? "var(--accent)" : "transparent" }}
                        >
                          {connectFromId ? "Pick target node" : "Connect selected node"}
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={handleDeleteSelection}
                          disabled={!selectedNodeId && !selectedEdgeId}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Delete Selection
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2}>
                        <Typography variant="h6">Selection</Typography>
                        {renderSelectionEditor()}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2}>
                        <Typography variant="h6">Draft Content</Typography>
                        <TextField
                          label="Diagram title"
                          value={plan.title}
                          onChange={(event) => updatePlanField("title", event.target.value)}
                        />
                        <TextField
                          label="Diagram summary"
                          multiline
                          minRows={3}
                          value={plan.summary}
                          onChange={(event) => updatePlanField("summary", event.target.value)}
                        />
                        <Stack spacing={1.2}>
                          <Typography variant="subtitle2">Assumptions</Typography>
                          {plan.assumptions.map((assumption, index) => (
                            <Stack key={`${index}-${assumption}`} direction={{ xs: "column", sm: "row" }} spacing={1}>
                              <TextField
                                fullWidth
                                label={`Assumption ${index + 1}`}
                                value={assumption}
                                onChange={(event) => updateAssumption(index, event.target.value)}
                              />
                              <Button
                                variant="outlined"
                                onClick={() => removeAssumption(index)}
                                disabled={plan.assumptions.length === 1}
                                sx={{ borderColor: "var(--line)", color: "var(--text)", minWidth: 108 }}
                              >
                                Remove
                              </Button>
                            </Stack>
                          ))}
                          <Button
                            variant="outlined"
                            onClick={addAssumption}
                            sx={{ alignSelf: "flex-start", borderColor: "var(--line)", color: "var(--text)" }}
                          >
                            Add Assumption
                          </Button>
                        </Stack>
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

  return (
    <Box sx={{ py: { xs: 4, md: 6 }, minHeight: "100vh" }}>
      <Container maxWidth="xl">
        <Stack spacing={3}>
          <Card
            sx={{
              borderRadius: 6,
              border: "1px solid var(--line)",
              boxShadow: "none",
              background: "var(--hero)"
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Stack spacing={2}>
                <Chip
                  label="Agent Architect"
                  sx={{ width: "fit-content", bgcolor: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 }}
                />
                <Typography variant="h2" sx={{ fontSize: { xs: "2.2rem", md: "3.8rem" }, lineHeight: 1 }}>
                  Create and edit multicloud architecture diagrams on a separate page.
                </Typography>
                <Typography variant="body1" sx={{ color: "var(--muted)", maxWidth: 900 }}>
                  Start from an architecture prompt or import the current estimate. The agent drafts the topology,
                  then you can drag services, add nodes, and connect clouds directly on the canvas.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Button
                    component={Link}
                    href="/estimator"
                    variant="outlined"
                    sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                  >
                    Back To Estimator
                  </Button>
                  <Button
                    component={Link}
                    href="/estimates"
                    variant="outlined"
                    sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                  >
                    Saved Estimates
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          {importMessage ? <Alert severity="success">{importMessage}</Alert> : null}

          <Grid container spacing={3}>
            <Grid item xs={12} lg={4}>
              <Stack spacing={3}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2.5}>
                        <Typography variant="h5">Agent Prompt</Typography>
                        <TextField
                          label="Architecture brief"
                        multiline
                        minRows={6}
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                          placeholder="Describe clouds, workload tiers, resilience, and shared services."
                        />
                        <FormControl fullWidth>
                          <InputLabel id="workspace-diagram-style-label">Diagram style</InputLabel>
                          <Select
                            labelId="workspace-diagram-style-label"
                            value={diagramStyle}
                            label="Diagram style"
                            onChange={(event) => setDiagramStyle(event.target.value as DiagramStyle)}
                          >
                            <MenuItem value="reference">Reference architecture</MenuItem>
                            <MenuItem value="network">Network topology</MenuItem>
                            <MenuItem value="workflow">Workflow diagram</MenuItem>
                          </Select>
                        </FormControl>
                        <Stack spacing={1}>
                          <Typography variant="subtitle2">Cloud targets</Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {architectureProviderOptions.map((provider) => {
                            const active = selectedProviders.includes(provider);
                            return (
                              <Chip
                                key={provider}
                                label={providerLabels[provider]}
                                onClick={() => toggleProvider(provider)}
                                sx={{
                                  fontWeight: 700,
                                  border: "1px solid",
                                  borderColor: active ? "var(--line-strong)" : "var(--line)",
                                  bgcolor: active ? "var(--accent-soft)" : "transparent",
                                  color: active ? "var(--accent)" : "var(--muted)"
                                }}
                              />
                            );
                          })}
                        </Stack>
                      </Stack>
                      <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                        Agent Architect now includes a broader market cloud library for diagramming. Cost estimation and
                        recommendation APIs still price AWS, Azure, and GCP.
                      </Typography>
                      <Alert severity="info">
                        Drag nodes, zones, and lanes directly on the diagram to move them. Select any element to edit
                        its text, size, and position, then use the add-node controls below to create new boxes.
                      </Alert>
                      <Stack spacing={1}>
                        <Typography variant="subtitle2">Quick prompts</Typography>
                        <Stack spacing={1}>
                          {quickPrompts.map((item) => (
                            <Chip
                              key={item}
                              label={item}
                              onClick={() => {
                                setPrompt(item);
                                setSelectedProviders(detectProviders(item, selectedProviders));
                              }}
                              sx={{
                                justifyContent: "flex-start",
                                height: "auto",
                                py: 0.8,
                                bgcolor: "var(--panel-soft)",
                                border: "1px solid var(--line)"
                              }}
                            />
                          ))}
                        </Stack>
                      </Stack>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <Button
                          variant="contained"
                          onClick={() => regenerateDiagram()}
                          disabled={isGenerating}
                          sx={{ bgcolor: "var(--accent)", color: "#ffffff", "&:hover": { bgcolor: "#265db8" } }}
                        >
                          {isGenerating ? "Generating..." : "Generate Diagram"}
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => {
                            setPrompt(quickPrompts[0]);
                            setSelectedProviders(DEFAULT_ARCHITECT_PROVIDERS);
                            setRequestContext(null);
                            setImportMessage(null);
                            regenerateDiagram(quickPrompts[0], DEFAULT_ARCHITECT_PROVIDERS, null);
                          }}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Reset Draft
                        </Button>
                      </Stack>
                      <Alert severity="info">{agentMessage}</Alert>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2.5}>
                      <Typography variant="h6">Canvas Controls</Typography>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <Button
                          variant={connectFromId ? "contained" : "outlined"}
                          onClick={() => setConnectFromId((current) => (current ? null : selectedNodeId))}
                          disabled={!selectedNodeId && !connectFromId}
                          sx={{
                            borderColor: "var(--line)",
                            color: connectFromId ? "#ffffff" : "var(--text)",
                            bgcolor: connectFromId ? "var(--accent)" : "transparent"
                          }}
                        >
                          {connectFromId ? "Pick target node" : "Connect selected node"}
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={handleDeleteSelection}
                          disabled={!selectedNodeId && !selectedEdgeId}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Delete Selection
                        </Button>
                      </Stack>
                      <FormControl fullWidth>
                        <InputLabel id="manual-provider-label">Node provider</InputLabel>
                        <Select
                          labelId="manual-provider-label"
                          value={manualProvider}
                          label="Node provider"
                          onChange={(event) => setManualProvider(event.target.value as DiagramProvider)}
                        >
                          <MenuItem value="shared">Shared</MenuItem>
                          {architectureProviderOptions.map((provider) => (
                            <MenuItem key={provider} value={provider}>
                              {providerLabels[provider]}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControl fullWidth>
                        <InputLabel id="manual-category-label">Node category</InputLabel>
                        <Select
                          labelId="manual-category-label"
                          value={manualCategory}
                          label="Node category"
                          onChange={(event) => setManualCategory(event.target.value as DiagramCategory)}
                        >
                          {categoryOptions.map((category) => (
                            <MenuItem key={category} value={category}>
                              {getCategoryLabel(category)}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        label="Node title"
                        value={manualTitle}
                        onChange={(event) => setManualTitle(event.target.value)}
                        placeholder="Leave blank to use the provider default"
                      />
                      <TextField
                        label="Node subtitle"
                        value={manualSubtitle}
                        onChange={(event) => setManualSubtitle(event.target.value)}
                      />
                      <Button
                        variant="contained"
                        onClick={handleAddNode}
                        sx={{ bgcolor: "#17315c", color: "#ffffff", "&:hover": { bgcolor: "#102443" } }}
                      >
                        Add Node To Diagram
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>

                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2}>
                        <Typography variant="h6">Selection</Typography>
                        {renderSelectionEditor()}
                      </Stack>
                    </CardContent>
                  </Card>

                  <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                    <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2}>
                        <Typography variant="h6">Draft Content</Typography>
                        <TextField
                          label="Diagram title"
                          value={plan.title}
                          onChange={(event) => updatePlanField("title", event.target.value)}
                        />
                        <TextField
                          label="Diagram summary"
                          multiline
                          minRows={3}
                          value={plan.summary}
                          onChange={(event) => updatePlanField("summary", event.target.value)}
                        />
                        <Stack spacing={1.2}>
                          <Typography variant="subtitle2">Assumptions</Typography>
                          {plan.assumptions.map((assumption, index) => (
                            <Stack key={`${index}-${assumption}`} direction={{ xs: "column", sm: "row" }} spacing={1}>
                              <TextField
                                fullWidth
                                label={`Assumption ${index + 1}`}
                                value={assumption}
                                onChange={(event) => updateAssumption(index, event.target.value)}
                              />
                              <Button
                                variant="outlined"
                                onClick={() => removeAssumption(index)}
                                disabled={plan.assumptions.length === 1}
                                sx={{ borderColor: "var(--line)", color: "var(--text)", minWidth: 108 }}
                              >
                                Remove
                              </Button>
                            </Stack>
                          ))}
                          <Button
                            variant="outlined"
                            onClick={addAssumption}
                            sx={{ alignSelf: "flex-start", borderColor: "var(--line)", color: "var(--text)" }}
                          >
                            Add Assumption
                          </Button>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </Card>
                </Stack>
              </Grid>
            <Grid item xs={12} lg={8}>
              <Stack spacing={3}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent>
                        <Typography variant="overline" sx={{ color: "var(--muted)" }}>
                          Draft title
                        </Typography>
                        <Typography variant="h6">{plan.title}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent>
                        <Typography variant="overline" sx={{ color: "var(--muted)" }}>
                          Clouds
                        </Typography>
                        <Typography variant="h6">{plan.providers.map((provider) => providerLabels[provider]).join(" + ")}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent>
                        <Typography variant="overline" sx={{ color: "var(--muted)" }}>
                          Elements
                        </Typography>
                        <Typography variant="h6">
                          {plan.nodes.length} nodes / {plan.edges.length} links
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                    <Stack spacing={2}>
                      <Stack
                        direction={{ xs: "column", md: "row" }}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", md: "center" }}
                        spacing={1.5}
                      >
                        <Box>
                          <Typography variant="h5">Diagram Canvas</Typography>
                          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                            Drag nodes to reposition them. Select a node and use connect mode to wire new paths.
                          </Typography>
                        </Box>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                          <Button
                            variant="outlined"
                            onClick={openCanvasPage}
                            sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                          >
                            Open Separate Canvas
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={downloadSvg}
                            sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                          >
                            Export SVG
                          </Button>
                        </Stack>
                      </Stack>
                      <Stack spacing={1.5}>
                        <ArchitectFlowCanvas
                          plan={plan}
                          diagramStyle={diagramStyle}
                          lanes={displayedCanvasLanes}
                          zones={displayedCanvasZones}
                          selectedNodeId={selectedNodeId}
                          selectedEdgeId={selectedEdgeId}
                          selectedZoneId={selectedZoneId}
                          selectedLaneId={selectedLaneId}
                          connectFromId={connectFromId}
                          canvasWidth={canvasWidth}
                          onSelectionChange={handleCanvasSelection}
                          onCreateEdge={handleCreateEdge}
                          onNodeLayoutChange={handleNodeLayoutChange}
                          onZoneLayoutChange={handleZoneLayoutChange}
                          onLaneLayoutChange={handleLaneLayoutChange}
                        />
                        <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", bgcolor: "rgba(255,255,255,0.86)" }}>
                          <CardContent sx={{ py: 1.5, px: 2 }}>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} flexWrap="wrap" useFlexGap>
                              <Typography variant="subtitle2" sx={{ minWidth: 68 }}>
                                Legend
                              </Typography>
                              {legendItems.map((item, index) => (
                                <Stack key={item} direction="row" spacing={1} alignItems="center">
                                  <Box
                                    sx={{
                                      width: 10,
                                      height: 10,
                                      borderRadius: "50%",
                                      bgcolor: index % 2 === 0 ? "#316fd6" : "#17315c"
                                    }}
                                  />
                                  <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                                    {item}
                                  </Typography>
                                </Stack>
                              ))}
                            </Stack>
                          </CardContent>
                        </Card>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>

                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={1.3}>
                      <Typography variant="h6">Agent Notes</Typography>
                      <Typography variant="body1" sx={{ color: "var(--muted)" }}>
                        {plan.summary}
                      </Typography>
                      {plan.assumptions.map((assumption) => (
                        <Typography key={assumption} variant="body2" sx={{ color: "var(--muted)" }}>
                          {assumption}
                        </Typography>
                      ))}
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
