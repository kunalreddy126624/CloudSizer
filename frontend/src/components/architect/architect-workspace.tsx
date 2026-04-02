"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  storeArchitectCanvasDraft,
  upsertSavedArchitectureDraft
} from "@/lib/scenario-store";
import { ArchitectFlowCanvas, type CanvasSelection } from "@/components/architect/architect-flow-canvas";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
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
  architecturePatterns,
  architectureScenarios,
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
  detectArchitecturePattern,
  detectArchitectureScenario,
  findNextPosition,
  getCategoryLabel,
  getArchitectureCanvasWidth,
  getLegendItems,
  getProviderLaneWidth,
  providerLabels,
  quickPrompts,
  type ArchitecturePatternId,
  type ArchitectureScenarioId,
  type ArchitectureCloudProvider,
  type CanvasLane,
  type CanvasZone,
  type DiagramCategory,
  type DiagramEdge,
  type DiagramNode,
  type DiagramPlan,
  type DiagramProvider,
  type DiagramStyle
} from "@/lib/architect-diagram";
import type { RecommendationRequest } from "@/lib/types";

interface ArchitectWorkspaceProps {
  canvasOnly?: boolean;
}

interface ArchitectHistorySnapshot {
  prompt: string;
  selectedPattern: ArchitecturePatternId;
  selectedScenario: ArchitectureScenarioId;
  selectedProviders: ArchitectureCloudProvider[];
  requestContext: RecommendationRequest | null;
  plan: DiagramPlan;
  diagramStyle: DiagramStyle;
  zoneOverrides: Record<string, Partial<CanvasZone>>;
  laneOverrides: Record<string, Partial<CanvasLane>>;
}

interface ArchitectHistoryState {
  past: ArchitectHistorySnapshot[];
  future: ArchitectHistorySnapshot[];
}

const emptyCanvasSelection: CanvasSelection = {
  nodeIds: [],
  edgeIds: [],
  zoneIds: [],
  laneIds: []
};
const MAX_HISTORY_ENTRIES = 80;

function areSelectionsEqual(left: CanvasSelection, right: CanvasSelection) {
  return (
    left.nodeIds.length === right.nodeIds.length &&
    left.edgeIds.length === right.edgeIds.length &&
    left.zoneIds.length === right.zoneIds.length &&
    left.laneIds.length === right.laneIds.length &&
    left.nodeIds.every((id, index) => id === right.nodeIds[index]) &&
    left.edgeIds.every((id, index) => id === right.edgeIds[index]) &&
    left.zoneIds.every((id, index) => id === right.zoneIds[index]) &&
    left.laneIds.every((id, index) => id === right.laneIds[index])
  );
}

function normalizeSelection(selection: CanvasSelection): CanvasSelection {
  return {
    nodeIds: [...new Set(selection.nodeIds)].sort(),
    edgeIds: [...new Set(selection.edgeIds)].sort(),
    zoneIds: [...new Set(selection.zoneIds)].sort(),
    laneIds: [...new Set(selection.laneIds)].sort()
  };
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.closest("[contenteditable='true']") !== null)
  );
}

function upsertEdgeConnection(
  edges: DiagramEdge[],
  connection: { from: string; to: string },
  replacementEdge?: DiagramEdge
) {
  const remainingEdges = replacementEdge ? edges.filter((edge) => edge.id !== replacementEdge.id) : edges;

  const existingBidirectional = remainingEdges.find(
    (edge) =>
      ((edge.from === connection.from && edge.to === connection.to) ||
        (edge.from === connection.to && edge.to === connection.from)) &&
      edge.bidirectional
  );

  if (existingBidirectional) {
    return { edges: remainingEdges, selectedEdgeId: existingBidirectional.id };
  }

  const directEdge = remainingEdges.find(
    (edge) => edge.from === connection.from && edge.to === connection.to
  );

  if (directEdge) {
    return { edges: remainingEdges, selectedEdgeId: directEdge.id };
  }

  const reverseEdge = remainingEdges.find(
    (edge) => edge.from === connection.to && edge.to === connection.from
  );

  if (reverseEdge) {
    return {
      edges: remainingEdges.map((edge) =>
        edge.id === reverseEdge.id ? { ...edge, bidirectional: true } : edge
      ),
      selectedEdgeId: reverseEdge.id
    };
  }

  const nextEdge: DiagramEdge = replacementEdge
    ? {
        ...replacementEdge,
        from: connection.from,
        to: connection.to,
        bidirectional: false
      }
    : {
        id: createId("edge"),
        from: connection.from,
        to: connection.to
      };

  return {
    edges: [...remainingEdges, nextEdge],
    selectedEdgeId: nextEdge.id
  };
}

export function ArchitectWorkspace({ canvasOnly = false }: ArchitectWorkspaceProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(quickPrompts[0]);
  const [selectedPattern, setSelectedPattern] = useState<ArchitecturePatternId>(() => detectArchitecturePattern(quickPrompts[0], architecturePatterns[0].id));
  const [selectedScenario, setSelectedScenario] = useState<ArchitectureScenarioId>(() => detectArchitectureScenario(quickPrompts[0], architectureScenarios[0].id));
  const [selectedProviders, setSelectedProviders] = useState<ArchitectureCloudProvider[]>(architecturePatterns[0].defaultProviders);
  const [requestContext, setRequestContext] = useState<RecommendationRequest | null>(null);
  const [plan, setPlan] = useState<DiagramPlan>(() =>
    buildArchitecturePlan(
      quickPrompts[0],
      architecturePatterns[0].defaultProviders,
      null,
      architecturePatterns[0].defaultDiagramStyle,
      architecturePatterns[0].id,
      architectureScenarios[0].id
    )
  );
  const [agentMessage, setAgentMessage] = useState(buildAgentMessage(plan));
  const [diagramStyle, setDiagramStyle] = useState<DiagramStyle>("reference");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<CanvasSelection>(emptyCanvasSelection);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [manualProvider, setManualProvider] = useState<DiagramProvider>("shared");
  const [manualCategory, setManualCategory] = useState<DiagramCategory>("compute");
  const [manualTitle, setManualTitle] = useState("");
  const [manualSubtitle, setManualSubtitle] = useState("");
  const [zoneOverrides, setZoneOverrides] = useState<Record<string, Partial<CanvasZone>>>({});
  const [laneOverrides, setLaneOverrides] = useState<Record<string, Partial<CanvasLane>>>({});
  const [historyState, setHistoryState] = useState<ArchitectHistoryState>({ past: [], future: [] });
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const [isGenerating, startGenerating] = useTransition();
  const historySnapshotRef = useRef<ArchitectHistorySnapshot | null>(null);
  const historySignatureRef = useRef<string>("");
  const isApplyingHistoryRef = useRef(false);

  const currentHistorySnapshot = useMemo<ArchitectHistorySnapshot>(
    () => ({
      prompt,
      selectedPattern,
      selectedScenario,
      selectedProviders,
      requestContext,
      plan,
      diagramStyle,
      zoneOverrides,
      laneOverrides
    }),
    [
      diagramStyle,
      laneOverrides,
      plan,
      prompt,
      requestContext,
      selectedPattern,
      selectedProviders,
      selectedScenario,
      zoneOverrides
    ]
  );
  const currentHistorySignature = useMemo(
    () => JSON.stringify(currentHistorySnapshot),
    [currentHistorySnapshot]
  );

  const applyHistorySnapshot = useCallback((snapshot: ArchitectHistorySnapshot) => {
    setPrompt(snapshot.prompt);
    setSelectedPattern(snapshot.selectedPattern);
    setSelectedScenario(snapshot.selectedScenario);
    setSelectedProviders(snapshot.selectedProviders);
    setRequestContext(snapshot.requestContext);
    setPlan(snapshot.plan);
    setDiagramStyle(snapshot.diagramStyle);
    setZoneOverrides(snapshot.zoneOverrides);
    setLaneOverrides(snapshot.laneOverrides);
    setAgentMessage(buildAgentMessage(snapshot.plan));
    setImportMessage(null);
    setSaveMessage(null);
    setConnectFromId(null);
    setSelection(emptyCanvasSelection);
  }, []);

  useEffect(() => {
    if (!canvasOnly) {
      return;
    }

    const draft = loadArchitectCanvasDraft();
    if (!draft) {
      setHistoryHydrated(true);
      return;
    }

    setPrompt(draft.prompt);
    setSelectedPattern((draft.plan as unknown as DiagramPlan).pattern ?? architecturePatterns[0].id);
    setSelectedScenario((draft.plan as unknown as DiagramPlan).scenario ?? architectureScenarios[0].id);
    setSelectedProviders(draft.selected_providers as ArchitectureCloudProvider[]);
    setDiagramStyle((draft.diagram_style as DiagramStyle | undefined) ?? "reference");
    setRequestContext(draft.request_context);
    setPlan(draft.plan as unknown as DiagramPlan);
    setZoneOverrides((draft.zone_overrides as Record<string, Partial<CanvasZone>> | undefined) ?? {});
    setLaneOverrides((draft.lane_overrides as Record<string, Partial<CanvasLane>> | undefined) ?? {});
    setAgentMessage(buildAgentMessage(draft.plan as unknown as DiagramPlan));
    setHistoryHydrated(true);
  }, [canvasOnly]);

  useEffect(() => {
    if (canvasOnly) {
      return;
    }

    const pendingScenario = loadPendingArchitectScenario();
    if (!pendingScenario) {
      setHistoryHydrated(true);
      return;
    }

    const nextPrompt =
      pendingScenario.prompt_override ?? buildPromptFromRequest(pendingScenario.request, pendingScenario.name);
    const nextPattern = detectArchitecturePattern(nextPrompt, selectedPattern);
    const nextScenario = detectArchitectureScenario(nextPrompt, selectedScenario);
    const nextPlan = buildArchitecturePlan(
      nextPrompt,
      pendingScenario.request.preferred_providers,
      pendingScenario.request,
      diagramStyle,
      nextPattern,
      nextScenario
    );

    setPrompt(nextPrompt);
    setSelectedPattern(nextPlan.pattern);
    setSelectedScenario(nextScenario);
    setSelectedProviders(nextPlan.providers);
    setRequestContext(pendingScenario.request);
    setPlan(nextPlan);
    setZoneOverrides({});
    setLaneOverrides({});
    setAgentMessage(buildAgentMessage(nextPlan));
    setImportMessage(`Imported "${pendingScenario.name}" into Agent Architect.`);
    clearPendingArchitectScenario();
    setHistoryHydrated(true);
  }, [canvasOnly, diagramStyle, selectedPattern, selectedScenario]);

  useEffect(() => {
    if (!canvasOnly || !historyHydrated) {
      return;
    }

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
  }, [
    canvasOnly,
    diagramStyle,
    historyHydrated,
    laneOverrides,
    plan,
    prompt,
    requestContext,
    selectedProviders,
    zoneOverrides
  ]);

  const nodeLookup = useMemo(() => {
    return plan.nodes.reduce<Record<string, DiagramNode>>((accumulator, node) => {
      accumulator[node.id] = node;
      return accumulator;
    }, {});
  }, [plan.nodes]);

  const selectedNodeIds = selection.nodeIds;
  const selectedEdgeIds = selection.edgeIds;
  const selectedZoneIds = selection.zoneIds;
  const selectedLaneIds = selection.laneIds;
  const singleSelectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  const singleSelectedEdgeId = selectedEdgeIds.length === 1 ? selectedEdgeIds[0] : null;
  const laneWidth = getProviderLaneWidth(plan.providers.length);
  const canvasWidth = getArchitectureCanvasWidth(plan);
  const canvasLanes = useMemo(() => buildCanvasLanes(plan, diagramStyle), [diagramStyle, plan]);
  const displayedCanvasLanes = useMemo(
    () => buildCanvasLanes(plan, diagramStyle, laneOverrides),
    [diagramStyle, laneOverrides, plan]
  );
  const canvasZones = useMemo(() => buildCanvasZones(plan, diagramStyle), [diagramStyle, plan]);
  const displayedCanvasZones = useMemo(
    () => buildCanvasZones(plan, diagramStyle, zoneOverrides),
    [diagramStyle, plan, zoneOverrides]
  );
  const singleSelectedZoneId = selectedZoneIds.length === 1 ? selectedZoneIds[0] : null;
  const singleSelectedLaneId = selectedLaneIds.length === 1 ? selectedLaneIds[0] : null;
  const selectedNode = singleSelectedNodeId ? nodeLookup[singleSelectedNodeId] ?? null : null;
  const selectedEdge = singleSelectedEdgeId ? plan.edges.find((edge) => edge.id === singleSelectedEdgeId) ?? null : null;
  const selectedZone: CanvasZone | null = singleSelectedZoneId
    ? displayedCanvasZones.find((zone) => zone.id === singleSelectedZoneId) ?? null
    : null;
  const selectedLane: CanvasLane | null = singleSelectedLaneId
    ? displayedCanvasLanes.find((lane) => lane.id === singleSelectedLaneId) ?? null
    : null;
  const totalSelectedCount =
    selectedNodeIds.length + selectedEdgeIds.length + selectedZoneIds.length + selectedLaneIds.length;
  const hasDeletableSelection = selectedNodeIds.length > 0 || selectedEdgeIds.length > 0;
  const selectedSummary = [
    selectedNodeIds.length ? `${selectedNodeIds.length} node${selectedNodeIds.length === 1 ? "" : "s"}` : null,
    selectedEdgeIds.length ? `${selectedEdgeIds.length} edge${selectedEdgeIds.length === 1 ? "" : "s"}` : null,
    selectedZoneIds.length ? `${selectedZoneIds.length} zone${selectedZoneIds.length === 1 ? "" : "s"}` : null,
    selectedLaneIds.length ? `${selectedLaneIds.length} lane${selectedLaneIds.length === 1 ? "" : "s"}` : null
  ]
    .filter(Boolean)
    .join(", ");
  const legendItems = useMemo(() => getLegendItems(diagramStyle), [diagramStyle]);
  const applySelection = useCallback((nextSelection: CanvasSelection) => {
    const normalized = normalizeSelection(nextSelection);
    setSelection((current) => (areSelectionsEqual(current, normalized) ? current : normalized));
  }, []);
  const clearSelection = useCallback(() => {
    applySelection(emptyCanvasSelection);
  }, [applySelection]);
  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;

  const handleUndo = useCallback(() => {
    if (!historyState.past.length) {
      return;
    }

    const previousSnapshot = historyState.past[historyState.past.length - 1];
    isApplyingHistoryRef.current = true;
    applyHistorySnapshot(previousSnapshot);
    setHistoryState({
      past: historyState.past.slice(0, -1),
      future: [currentHistorySnapshot, ...historyState.future].slice(0, MAX_HISTORY_ENTRIES)
    });
  }, [applyHistorySnapshot, currentHistorySnapshot, historyState]);

  const handleRedo = useCallback(() => {
    if (!historyState.future.length) {
      return;
    }

    const [nextSnapshot, ...remainingFuture] = historyState.future;
    isApplyingHistoryRef.current = true;
    applyHistorySnapshot(nextSnapshot);
    setHistoryState({
      past: [...historyState.past, currentHistorySnapshot].slice(-MAX_HISTORY_ENTRIES),
      future: remainingFuture
    });
  }, [applyHistorySnapshot, currentHistorySnapshot, historyState]);

  const clampCanvasLayout = useCallback((x: number, y: number, width: number, height: number) => {
    return {
      x: Math.min(Math.max(x, 16), canvasWidth - width - 16),
      y: Math.min(Math.max(y, 16), CANVAS_HEIGHT - height - 16)
    };
  }, [canvasWidth]);

  useEffect(() => {
    if (!historyHydrated) {
      return;
    }

    if (isApplyingHistoryRef.current) {
      historySnapshotRef.current = currentHistorySnapshot;
      historySignatureRef.current = currentHistorySignature;
      isApplyingHistoryRef.current = false;
      return;
    }

    if (!historySnapshotRef.current) {
      historySnapshotRef.current = currentHistorySnapshot;
      historySignatureRef.current = currentHistorySignature;
      return;
    }

    if (historySignatureRef.current === currentHistorySignature) {
      return;
    }

    const previousSnapshot = historySnapshotRef.current;
    historySnapshotRef.current = currentHistorySnapshot;
    historySignatureRef.current = currentHistorySignature;

    setHistoryState((current) => ({
      past: [...current.past, previousSnapshot].slice(-MAX_HISTORY_ENTRIES),
      future: []
    }));
  }, [currentHistorySignature, currentHistorySnapshot, historyHydrated]);

  const nudgeSelection = useCallback((deltaX: number, deltaY: number) => {
    if (!selectedNodeIds.length && !selectedZoneIds.length && !selectedLaneIds.length) {
      return;
    }

    if (selectedNodeIds.length) {
      const nodeIdSet = new Set(selectedNodeIds);
      setPlan((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          nodeIdSet.has(node.id)
            ? {
                ...node,
                ...clampCanvasLayout(node.x + deltaX, node.y + deltaY, node.width, node.height)
              }
            : node
        )
      }));
    }

    if (selectedZoneIds.length) {
      const zoneLookup = new Map(displayedCanvasZones.map((zone) => [zone.id, zone]));
      setZoneOverrides((current) => {
        const nextOverrides = { ...current };

        for (const zoneId of selectedZoneIds) {
          const zone = zoneLookup.get(zoneId);
          if (!zone) {
            continue;
          }

          const position = clampCanvasLayout(zone.x + deltaX, zone.y + deltaY, zone.width, zone.height);
          nextOverrides[zoneId] = {
            ...(current[zoneId] ?? {}),
            ...position,
            width: zone.width,
            height: zone.height
          };
        }

        return nextOverrides;
      });
    }

    if (selectedLaneIds.length) {
      const laneLookup = new Map(displayedCanvasLanes.map((lane) => [lane.id, lane]));
      setLaneOverrides((current) => {
        const nextOverrides = { ...current };

        for (const laneId of selectedLaneIds) {
          const lane = laneLookup.get(laneId);
          if (!lane) {
            continue;
          }

          const position = clampCanvasLayout(lane.x + deltaX, lane.y + deltaY, lane.width, lane.height);
          nextOverrides[laneId] = {
            ...(current[laneId] ?? {}),
            ...position,
            width: lane.width,
            height: lane.height
          };
        }

        return nextOverrides;
      });
    }
  }, [
    clampCanvasLayout,
    displayedCanvasLanes,
    displayedCanvasZones,
    selectedLaneIds,
    selectedNodeIds,
    selectedZoneIds
  ]);

  const persistArchitectureDraft = useCallback(() => {
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
  }, [diagramStyle, laneOverrides, plan, prompt, requestContext, selectedProviders, zoneOverrides]);

  const saveArchitecture = useCallback(() => {
    const savedAt = new Date().toISOString();
    const draftId = createId("architecture");
    const draftRecord = {
      id: draftId,
      name: plan.title,
      prompt,
      selected_providers: selectedProviders,
      diagram_style: diagramStyle,
      request_context: requestContext,
      plan: plan as unknown as Record<string, unknown>,
      zone_overrides: zoneOverrides,
      lane_overrides: laneOverrides,
      saved_at: savedAt
    };
    storeArchitectCanvasDraft(draftRecord);
    upsertSavedArchitectureDraft(draftRecord);
    setSaveMessage(`Saved "${plan.title}" to Saved Work.`);
  }, [
    diagramStyle,
    laneOverrides,
    plan,
    prompt,
    requestContext,
    selectedProviders,
    zoneOverrides
  ]);

  useEffect(() => {
    function handleWorkspaceKeyDown(event: KeyboardEvent) {
      const isMetaPressed = event.ctrlKey || event.metaKey;
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasMovableSelection = selectedNodeIds.length > 0 || selectedZoneIds.length > 0 || selectedLaneIds.length > 0;
      if (isMetaPressed && key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }

      if (isMetaPressed && ((key === "z" && event.shiftKey) || key === "y")) {
        event.preventDefault();
        handleRedo();
        return;
      }

      if (isMetaPressed && key === "s") {
        event.preventDefault();
        saveArchitecture();
        return;
      }

      const distance = event.shiftKey ? 48 : 16;
      if (event.key === "ArrowLeft" && hasMovableSelection) {
        event.preventDefault();
        nudgeSelection(-distance, 0);
        return;
      }

      if (event.key === "ArrowRight" && hasMovableSelection) {
        event.preventDefault();
        nudgeSelection(distance, 0);
        return;
      }

      if (event.key === "ArrowUp" && hasMovableSelection) {
        event.preventDefault();
        nudgeSelection(0, -distance);
        return;
      }

      if (event.key === "ArrowDown" && hasMovableSelection) {
        event.preventDefault();
        nudgeSelection(0, distance);
      }
    }

    window.addEventListener("keydown", handleWorkspaceKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWorkspaceKeyDown);
    };
  }, [handleRedo, handleUndo, nudgeSelection, saveArchitecture]);

  function regenerateDiagram(nextPrompt = prompt, nextProviders = selectedProviders, nextRequest = requestContext) {
    setImportMessage(null);
    setAgentMessage("Generating architecture diagram...");
    startGenerating(() => {
      const nextPlan = buildArchitecturePlan(
        nextPrompt,
        nextProviders,
        nextRequest,
        diagramStyle,
        selectedPattern,
        selectedScenario
      );
      setPlan(nextPlan);
      setSelectedPattern(nextPlan.pattern);
      setSelectedProviders(nextPlan.providers);
      setZoneOverrides({});
      setLaneOverrides({});
      setAgentMessage(buildAgentMessage(nextPlan));
      clearSelection();
      setConnectFromId(null);
    });
  }

  function stripScenarioPromptSuffix(currentPrompt: string) {
    return architectureScenarios.reduce((value, entry) => {
      return value.endsWith(` ${entry.promptSuffix}`) ? value.slice(0, -(entry.promptSuffix.length + 1)).trim() : value;
    }, currentPrompt.trim());
  }

  function applyPattern(
    patternId: ArchitecturePatternId,
    nextRequestContext = requestContext,
    nextScenarioId = selectedScenario
  ) {
    const entry = architecturePatterns.find((candidate) => candidate.id === patternId);
    if (!entry) {
      return;
    }

    const scenarioEntry = architectureScenarios.find((candidate) => candidate.id === nextScenarioId) ?? architectureScenarios[0];
    const nextPrompt = `${entry.prompt} ${scenarioEntry.promptSuffix}`.trim();
    const nextPlan = buildArchitecturePlan(
      nextPrompt,
      entry.defaultProviders,
      nextRequestContext,
      entry.defaultDiagramStyle,
      patternId,
      nextScenarioId
    );
    setSelectedPattern(patternId);
    setSelectedScenario(nextScenarioId);
    setPrompt(nextPrompt);
    setSelectedProviders(entry.defaultProviders);
    setDiagramStyle(entry.defaultDiagramStyle);
    setImportMessage(null);
    setPlan(nextPlan);
    setAgentMessage(buildAgentMessage(nextPlan));
    setZoneOverrides({});
    setLaneOverrides({});
    clearSelection();
    setConnectFromId(null);
  }

  function applyScenario(scenarioId: ArchitectureScenarioId, nextRequestContext = requestContext) {
    const entry = architectureScenarios.find((candidate) => candidate.id === scenarioId);
    if (!entry) {
      return;
    }

    const nextPrompt = `${stripScenarioPromptSuffix(prompt)} ${entry.promptSuffix}`.trim();
    const nextPlan = buildArchitecturePlan(
      nextPrompt,
      selectedProviders,
      nextRequestContext,
      diagramStyle,
      selectedPattern,
      scenarioId
    );
    setSelectedPattern(nextPlan.pattern);
    setSelectedScenario(scenarioId);
    setPrompt(nextPrompt);
    setSelectedProviders(nextPlan.providers);
    setImportMessage(null);
    setPlan(nextPlan);
    setAgentMessage(buildAgentMessage(nextPlan));
    setZoneOverrides({});
    setLaneOverrides({});
    clearSelection();
    setConnectFromId(null);
  }

  function applyDiagramStyle(nextDiagramStyle: DiagramStyle) {
    if (nextDiagramStyle === diagramStyle) {
      return;
    }

    const nextPlan = buildArchitecturePlan(
      prompt,
      selectedProviders,
      requestContext,
      nextDiagramStyle,
      selectedPattern,
      selectedScenario
    );

    setDiagramStyle(nextDiagramStyle);
    setImportMessage(null);
    setPlan(nextPlan);
    setSelectedPattern(nextPlan.pattern);
    setSelectedProviders(nextPlan.providers);
    setZoneOverrides({});
    setLaneOverrides({});
    setAgentMessage(buildAgentMessage(nextPlan));
    clearSelection();
    setConnectFromId(null);
  }

  function toggleProvider(provider: ArchitectureCloudProvider) {
    const nextProviders = selectedProviders.includes(provider)
      ? selectedProviders.length === 1
        ? selectedProviders
        : selectedProviders.filter((item) => item !== provider)
      : [...selectedProviders, provider];
    const nextPlan = buildArchitecturePlan(
      prompt,
      nextProviders,
      requestContext,
      diagramStyle,
      selectedPattern,
      selectedScenario
    );

    setSelectedProviders(nextPlan.providers);
    setPlan(nextPlan);
    setSelectedPattern(nextPlan.pattern);
    setImportMessage(null);
    setAgentMessage(buildAgentMessage(nextPlan));
    setZoneOverrides({});
    setLaneOverrides({});
    clearSelection();
    setConnectFromId(null);
  }

  useEffect(() => {
    const validZoneIds = new Set(canvasZones.map((zone) => zone.id));
    setZoneOverrides((current) =>
      Object.keys(current).every((zoneId) => validZoneIds.has(zoneId))
        ? current
        : Object.fromEntries(Object.entries(current).filter(([zoneId]) => validZoneIds.has(zoneId)))
    );
    applySelection({
      nodeIds: selectedNodeIds,
      edgeIds: selectedEdgeIds,
      zoneIds: selectedZoneIds.filter((zoneId) => validZoneIds.has(zoneId)),
      laneIds: selectedLaneIds
    });
  }, [applySelection, canvasZones, selectedEdgeIds, selectedLaneIds, selectedNodeIds, selectedZoneIds]);

  useEffect(() => {
    const validLaneIds = new Set(canvasLanes.map((lane) => lane.id));
    setLaneOverrides((current) =>
      Object.keys(current).every((laneId) => validLaneIds.has(laneId))
        ? current
        : Object.fromEntries(Object.entries(current).filter(([laneId]) => validLaneIds.has(laneId)))
    );
    applySelection({
      nodeIds: selectedNodeIds,
      edgeIds: selectedEdgeIds,
      zoneIds: selectedZoneIds,
      laneIds: selectedLaneIds.filter((laneId) => validLaneIds.has(laneId))
    });
  }, [applySelection, canvasLanes, selectedEdgeIds, selectedLaneIds, selectedNodeIds, selectedZoneIds]);

  useEffect(() => {
    const validNodeIds = new Set(plan.nodes.map((node) => node.id));
    const validEdgeIds = new Set(plan.edges.map((edge) => edge.id));
    const nextConnectFromId = connectFromId && validNodeIds.has(connectFromId) ? connectFromId : null;

    applySelection({
      nodeIds: selectedNodeIds.filter((nodeId) => validNodeIds.has(nodeId)),
      edgeIds: selectedEdgeIds.filter((edgeId) => validEdgeIds.has(edgeId)),
      zoneIds: selectedZoneIds,
      laneIds: selectedLaneIds
    });

    if (nextConnectFromId !== connectFromId) {
      setConnectFromId(nextConnectFromId);
    }
  }, [applySelection, connectFromId, plan.edges, plan.nodes, selectedEdgeIds, selectedLaneIds, selectedNodeIds, selectedZoneIds]);

  const handleCreateEdge = useCallback((connection: { from: string; to: string }) => {
    let nextSelectedEdgeId: string | null = null;

    setPlan((current) => {
      const edgeUpdate = upsertEdgeConnection(current.edges, connection);
      nextSelectedEdgeId = edgeUpdate.selectedEdgeId;

      return {
        ...current,
        edges: edgeUpdate.edges
      };
    });

    setConnectFromId(null);
    applySelection({
      ...emptyCanvasSelection,
      edgeIds: nextSelectedEdgeId ? [nextSelectedEdgeId] : []
    });
  }, [applySelection]);

  const handleReconnectEdge = useCallback((edgeId: string, connection: { from: string; to: string }) => {
    let nextSelectedEdgeId: string | null = null;

    setPlan((current) => {
      const currentEdge = current.edges.find((edge) => edge.id === edgeId);
      if (!currentEdge) {
        return current;
      }

      const edgeUpdate = upsertEdgeConnection(current.edges, connection, currentEdge);
      nextSelectedEdgeId = edgeUpdate.selectedEdgeId;

      return {
        ...current,
        edges: edgeUpdate.edges
      };
    });

    applySelection({
      ...emptyCanvasSelection,
      edgeIds: nextSelectedEdgeId ? [nextSelectedEdgeId] : []
    });
  }, [applySelection]);

  const handleNodeLayoutChange = useCallback((id: string, next: { x: number; y: number; width: number; height: number }) => {
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
  }, [canvasWidth, clampCanvasLayout]);

  const handleZoneLayoutChange = useCallback((id: string, next: { x: number; y: number; width: number; height: number }) => {
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
  }, [canvasWidth, clampCanvasLayout]);

  const handleLaneLayoutChange = useCallback((id: string, next: { x: number; y: number; width: number; height: number }) => {
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
  }, [canvasWidth, clampCanvasLayout]);

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
    applySelection({ ...emptyCanvasSelection, nodeIds: [node.id] });
    setManualTitle("");
    setManualSubtitle("");
  }

  function handleDeleteSelection() {
    if (selectedNodeIds.length > 0 || selectedEdgeIds.length > 0) {
      const nodeIdSet = new Set(selectedNodeIds);
      const edgeIdSet = new Set(selectedEdgeIds);
      setPlan((current) => ({
        ...current,
        nodes: current.nodes.filter((node) => !nodeIdSet.has(node.id)),
        edges: current.edges.filter(
          (edge) => !edgeIdSet.has(edge.id) && !nodeIdSet.has(edge.from) && !nodeIdSet.has(edge.to)
        )
      }));
      clearSelection();
      if (connectFromId && nodeIdSet.has(connectFromId)) {
        setConnectFromId(null);
      }
      return;
    }

    if (selectedZoneIds.length > 0 || selectedLaneIds.length > 0) {
      clearSelection();
      setConnectFromId(null);
    }
  }

  function updateSelectedNodeField<Key extends keyof DiagramNode>(field: Key, value: DiagramNode[Key]) {
    if (!singleSelectedNodeId) {
      return;
    }

    setPlan((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === singleSelectedNodeId ? { ...node, [field]: value } : node))
    }));
  }

  function updateSelectedNodeLayout(field: "x" | "y" | "width" | "height", value: string) {
    if (!singleSelectedNodeId) {
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    const target = nodeLookup[singleSelectedNodeId];
    if (!target) {
      return;
    }

    handleNodeLayoutChange(singleSelectedNodeId, {
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
    if (!singleSelectedNodeId) {
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
        node.id === singleSelectedNodeId
          ? {
              ...node,
              [field]: Math.max(numericValue, minimum)
            }
          : node
      )
    }));
  }

  function updateSelectedEdgeLabel(value: string) {
    if (!singleSelectedEdgeId) {
      return;
    }

    setPlan((current) => ({
      ...current,
      edges: current.edges.map((edge) =>
        edge.id === singleSelectedEdgeId
          ? {
              ...edge,
              label: value.trim() ? value : undefined
            }
          : edge
      )
    }));
  }

  function updateSelectedZoneField(field: "label" | "fontSize" | "x" | "y" | "width" | "height", value: string) {
    if (!singleSelectedZoneId) {
      return;
    }

    setZoneOverrides((current) => {
      const next = { ...(current[singleSelectedZoneId] ?? {}) };

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
          const baseZone = displayedCanvasZones.find((zone) => zone.id === singleSelectedZoneId);
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
        [singleSelectedZoneId]: next
      };
    });
  }

  function updateSelectedLaneField(field: "label" | "fontSize" | "x" | "y" | "width" | "height", value: string) {
    if (!singleSelectedLaneId) {
      return;
    }

    setLaneOverrides((current) => {
      const next = { ...(current[singleSelectedLaneId] ?? {}) };

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
          const baseLane = displayedCanvasLanes.find((lane) => lane.id === singleSelectedLaneId);
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
        [singleSelectedLaneId]: next
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
    persistArchitectureDraft();
    router.push("/architect/canvas");
  }

  const handleCanvasSelection = useCallback((selection: CanvasSelection) => {
    applySelection(selection);
  }, [applySelection]);

  function renderSelectionEditor() {
    if (totalSelectedCount > 1) {
      return (
        <Stack spacing={1.2}>
          <Typography variant="body2" sx={{ color: "var(--text)", fontWeight: 600 }}>
            {selectedSummary} selected.
          </Typography>
          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
            Drag on empty canvas to box-select multiple items.
          </Typography>
          <Typography variant="body2" sx={{ color: "var(--muted)" }}>
            Bulk delete works for selected nodes and edges. Detailed property editing is available when exactly one item is selected.
          </Typography>
        </Stack>
      );
    }

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
            {selectedEdge.bidirectional ? "Bidirectional flow" : "Edge"} selected between {nodeLookup[selectedEdge.from]?.title ?? "source"} and{" "}
            {nodeLookup[selectedEdge.to]?.title ?? "target"}.
          </Typography>
          <TextField
            label="Edge label"
            value={selectedEdge.label ?? ""}
            onChange={(event) => updateSelectedEdgeLabel(event.target.value)}
            helperText={
              selectedEdge.bidirectional
                ? "Label shown on the two-way connector."
                : "Optional label shown on the connector. Add the reverse direction to turn it into a bidirectional flow."
            }
          />
        </>
      );
    }

    return (
      <Stack spacing={1}>
        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
          Select a node, lane, zone, or edge to edit it.
        </Typography>
        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
          Drag on empty canvas to select multiple items.
        </Typography>
      </Stack>
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
                    <Button
                      variant="contained"
                      onClick={saveArchitecture}
                      sx={{ bgcolor: "var(--accent)", color: "#ffffff", "&:hover": { bgcolor: "#265db8" } }}
                    >
                      Save Architecture
                    </Button>
                    <Button variant="outlined" onClick={downloadSvg} sx={{ borderColor: "var(--line)", color: "var(--text)" }}>
                      Export SVG
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            {importMessage ? <Alert severity="success">{importMessage}</Alert> : null}
            {saveMessage ? <Alert severity="success">{saveMessage}</Alert> : null}

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
                        <FormControl fullWidth>
                          <InputLabel id="diagram-pattern-label">Architecture pattern</InputLabel>
                          <Select
                            labelId="diagram-pattern-label"
                            value={selectedPattern}
                            label="Architecture pattern"
                            onChange={(event) => applyPattern(event.target.value as ArchitecturePatternId)}
                          >
                            {architecturePatterns.map((entry) => (
                              <MenuItem key={entry.id} value={entry.id}>
                                {entry.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl fullWidth>
                          <InputLabel id="diagram-scenario-label">Solution scenario</InputLabel>
                          <Select
                            labelId="diagram-scenario-label"
                            value={selectedScenario}
                            label="Solution scenario"
                            onChange={(event) => applyScenario(event.target.value as ArchitectureScenarioId)}
                          >
                            {architectureScenarios.map((entry) => (
                              <MenuItem key={entry.id} value={entry.id}>
                                {entry.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
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
                            onChange={(event) => applyDiagramStyle(event.target.value as DiagramStyle)}
                          >
                            <MenuItem value="reference">Reference architecture</MenuItem>
                            <MenuItem value="network">Network topology</MenuItem>
                            <MenuItem value="workflow">Workflow diagram</MenuItem>
                          </Select>
                        </FormControl>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {architecturePatterns.map((entry) => (
                            <Chip
                              key={entry.id}
                              label={`${entry.label}: ${entry.description}`}
                              onClick={() => applyPattern(entry.id)}
                              sx={{
                                maxWidth: "100%",
                                bgcolor: entry.id === selectedPattern ? "var(--accent-soft)" : "var(--panel-soft)",
                                border: "1px solid var(--line)"
                              }}
                            />
                          ))}
                        </Stack>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                          {architectureScenarios.map((entry) => (
                            <Chip
                              key={entry.id}
                              label={entry.label}
                              onClick={() => applyScenario(entry.id)}
                              sx={{
                                maxWidth: "100%",
                                bgcolor: entry.id === selectedScenario ? "var(--accent-soft)" : "var(--panel-soft)",
                                border: "1px solid var(--line)"
                              }}
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
                      selectedNodeIds={selectedNodeIds}
                      selectedEdgeIds={selectedEdgeIds}
                      selectedZoneIds={selectedZoneIds}
                      selectedLaneIds={selectedLaneIds}
                      connectFromId={connectFromId}
                      canvasWidth={canvasWidth}
                      onSelectionChange={handleCanvasSelection}
                      onCreateEdge={handleCreateEdge}
                      onReconnectEdge={handleReconnectEdge}
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
                          Drag nodes, zones, lanes, and connector endpoints on the canvas to update the draft. Select
                          any visible element to edit its label, size, or position. To create a link, select a node,
                          click connect mode, then click the target node.
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
                          variant="outlined"
                          onClick={handleUndo}
                          disabled={!canUndo}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Undo
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={handleRedo}
                          disabled={!canRedo}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Redo
                        </Button>
                        <Button
                          variant={connectFromId ? "contained" : "outlined"}
                          onClick={() => setConnectFromId((current) => (current ? null : singleSelectedNodeId))}
                          disabled={!singleSelectedNodeId && !connectFromId}
                          sx={{ borderColor: "var(--line)", color: connectFromId ? "#ffffff" : "var(--text)", bgcolor: connectFromId ? "var(--accent)" : "transparent" }}
                        >
                          {connectFromId ? "Pick target node" : "Connect selected node"}
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={handleDeleteSelection}
                          disabled={!hasDeletableSelection}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Delete Selection
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={saveArchitecture}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Save Architecture
                        </Button>
                        <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                          Shortcuts: Arrow keys move selected items, Shift+Arrow moves faster, Ctrl/Cmd+S saves, and
                          Ctrl/Cmd+Z or Ctrl+Y undo and redo.
                        </Typography>
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
          {saveMessage ? <Alert severity="success">{saveMessage}</Alert> : null}

          <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
            <CardContent sx={{ p: { xs: 3, md: 3.5 } }}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Stack spacing={1.2}>
                    <Chip
                      label="Design Platter"
                      sx={{ width: "fit-content", bgcolor: "var(--accent-soft)", color: "var(--accent)", fontWeight: 700 }}
                    />
                    <Typography variant="h5">Visible coverage for real-world architecture design</Typography>
                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                      Agent Architect now exposes the full supported architecture pattern set and industry scenario set
                      directly on the page.
                    </Typography>
                    <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                      {architecturePatterns.length} patterns x {architectureScenarios.length} scenarios
                    </Typography>
                  </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Stack spacing={1.2}>
                    <Typography variant="subtitle2">Supported Architecture Patterns</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {architecturePatterns.map((entry) => (
                        <Chip
                          key={`visible-pattern-${entry.id}`}
                          label={entry.label}
                          sx={{ bgcolor: "var(--panel-soft)", border: "1px solid var(--line)" }}
                        />
                      ))}
                    </Stack>
                  </Stack>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Stack spacing={1.2}>
                    <Typography variant="subtitle2">Supported Real-World Scenarios</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {architectureScenarios.map((entry) => (
                        <Chip
                          key={`visible-scenario-${entry.id}`}
                          label={entry.label}
                          sx={{ bgcolor: "var(--panel-soft)", border: "1px solid var(--line)" }}
                        />
                      ))}
                    </Stack>
                  </Stack>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Grid container spacing={3}>
            <Grid item xs={12} lg={4}>
              <Stack spacing={3}>
                <Card sx={{ borderRadius: 5, border: "1px solid var(--line)", boxShadow: "none" }}>
                  <CardContent sx={{ p: 3 }}>
                      <Stack spacing={2.5}>
                        <Typography variant="h5">Agent Prompt</Typography>
                        <FormControl fullWidth>
                          <InputLabel id="workspace-pattern-label">Architecture pattern</InputLabel>
                          <Select
                            labelId="workspace-pattern-label"
                            value={selectedPattern}
                            label="Architecture pattern"
                            onChange={(event) => applyPattern(event.target.value as ArchitecturePatternId)}
                          >
                            {architecturePatterns.map((entry) => (
                              <MenuItem key={entry.id} value={entry.id}>
                                {entry.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <FormControl fullWidth>
                          <InputLabel id="workspace-scenario-label">Solution scenario</InputLabel>
                          <Select
                            labelId="workspace-scenario-label"
                            value={selectedScenario}
                            label="Solution scenario"
                            onChange={(event) => applyScenario(event.target.value as ArchitectureScenarioId)}
                          >
                            {architectureScenarios.map((entry) => (
                              <MenuItem key={entry.id} value={entry.id}>
                                {entry.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
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
                            onChange={(event) => applyDiagramStyle(event.target.value as DiagramStyle)}
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
                        Agent Architect now includes a pattern library for single-tier, N-tier, microservices,
                        event-driven, serverless, data, hybrid, multi-cloud, and HA/DR designs plus real-world
                        solution contexts like banking, e-commerce, streaming, healthcare, ERP, SaaS, and IoT.
                      </Typography>
                      <Alert severity="info">
                        Drag nodes, zones, lanes, and connector endpoints directly on the diagram. Select any element
                        to edit its text, size, and position, then use the add-node controls below to create new boxes.
                      </Alert>
                      <Stack spacing={1}>
                        <Typography variant="subtitle2">Pattern library</Typography>
                        <Stack spacing={1}>
                          {architecturePatterns.map((entry) => (
                            <Chip
                              key={entry.id}
                              label={`${entry.label}: ${entry.description}`}
                              onClick={() => applyPattern(entry.id)}
                              sx={{
                                justifyContent: "flex-start",
                                height: "auto",
                                py: 0.8,
                                bgcolor: entry.id === selectedPattern ? "var(--accent-soft)" : "var(--panel-soft)",
                                border: "1px solid var(--line)"
                              }}
                            />
                          ))}
                        </Stack>
                      </Stack>
                      <Stack spacing={1}>
                        <Typography variant="subtitle2">Scenario library</Typography>
                        <Stack spacing={1}>
                          {architectureScenarios.map((entry) => (
                            <Chip
                              key={entry.id}
                              label={`${entry.label}: ${entry.description}`}
                              onClick={() => applyScenario(entry.id)}
                              sx={{
                                justifyContent: "flex-start",
                                height: "auto",
                                py: 0.8,
                                bgcolor: entry.id === selectedScenario ? "var(--accent-soft)" : "var(--panel-soft)",
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
                          onClick={saveArchitecture}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Save Architecture
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={() => {
                            const baseline = architecturePatterns[0];
                            setRequestContext(null);
                            applyPattern(baseline.id, null, architectureScenarios[0].id);
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
                          variant="outlined"
                          onClick={handleUndo}
                          disabled={!canUndo}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Undo
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={handleRedo}
                          disabled={!canRedo}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Redo
                        </Button>
                        <Button
                          variant={connectFromId ? "contained" : "outlined"}
                          onClick={() => setConnectFromId((current) => (current ? null : singleSelectedNodeId))}
                          disabled={!singleSelectedNodeId && !connectFromId}
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
                          disabled={!hasDeletableSelection}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Delete Selection
                        </Button>
                        <Button
                          variant="outlined"
                          onClick={saveArchitecture}
                          sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                        >
                          Save Architecture
                        </Button>
                      </Stack>
                      <Typography variant="caption" sx={{ color: "var(--muted)" }}>
                        Shortcuts: Arrow keys move selected items, Shift+Arrow moves faster, Ctrl/Cmd+S saves, and
                        Ctrl/Cmd+Z or Ctrl+Y undo and redo.
                      </Typography>
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
                          Pattern / Scenario
                        </Typography>
                        <Typography variant="h6">{plan.patternLabel}</Typography>
                        <Typography variant="body2" sx={{ color: "var(--muted)" }}>
                          {plan.scenarioLabel}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ borderRadius: 4, border: "1px solid var(--line)", boxShadow: "none", height: "100%" }}>
                      <CardContent>
                        <Typography variant="overline" sx={{ color: "var(--muted)" }}>
                          Clouds / Elements
                        </Typography>
                        <Typography variant="h6">
                          {plan.providers.map((provider) => providerLabels[provider]).join(" + ")} | {plan.nodes.length} / {plan.edges.length}
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
                            onClick={saveArchitecture}
                            sx={{ borderColor: "var(--line)", color: "var(--text)" }}
                          >
                            Save Architecture
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
                          selectedNodeIds={selectedNodeIds}
                          selectedEdgeIds={selectedEdgeIds}
                          selectedZoneIds={selectedZoneIds}
                          selectedLaneIds={selectedLaneIds}
                          connectFromId={connectFromId}
                          canvasWidth={canvasWidth}
                          onSelectionChange={handleCanvasSelection}
                          onCreateEdge={handleCreateEdge}
                          onReconnectEdge={handleReconnectEdge}
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
                    <Stack spacing={2}>
                      <Typography variant="h6">Agent Notes</Typography>
                      <Typography variant="body1" sx={{ color: "var(--muted)" }}>
                        {plan.summary}
                      </Typography>
                      <Stack spacing={0.8}>
                        <Typography variant="subtitle2">Assumptions</Typography>
                        {plan.assumptions.map((assumption) => (
                          <Typography key={assumption} variant="body2" sx={{ color: "var(--muted)" }}>
                            {assumption}
                          </Typography>
                        ))}
                      </Stack>
                      <Stack spacing={0.8}>
                        <Typography variant="subtitle2">Components</Typography>
                        {plan.components.map((item) => (
                          <Typography key={item} variant="body2" sx={{ color: "var(--muted)" }}>
                            {item}
                          </Typography>
                        ))}
                      </Stack>
                      <Stack spacing={0.8}>
                        <Typography variant="subtitle2">Cloud Services</Typography>
                        {plan.cloudServices.map((item) => (
                          <Typography key={item} variant="body2" sx={{ color: "var(--muted)" }}>
                            {item}
                          </Typography>
                        ))}
                      </Stack>
                      <Stack spacing={0.8}>
                        <Typography variant="subtitle2">Data Flow</Typography>
                        {plan.dataFlow.map((item) => (
                          <Typography key={item} variant="body2" sx={{ color: "var(--muted)" }}>
                            {item}
                          </Typography>
                        ))}
                      </Stack>
                      <Stack spacing={0.8}>
                        <Typography variant="subtitle2">Scaling Strategy</Typography>
                        {plan.scalingStrategy.map((item) => (
                          <Typography key={item} variant="body2" sx={{ color: "var(--muted)" }}>
                            {item}
                          </Typography>
                        ))}
                      </Stack>
                      <Stack spacing={0.8}>
                        <Typography variant="subtitle2">Security</Typography>
                        {plan.securityConsiderations.map((item) => (
                          <Typography key={item} variant="body2" sx={{ color: "var(--muted)" }}>
                            {item}
                          </Typography>
                        ))}
                      </Stack>
                      <Stack spacing={0.8}>
                        <Typography variant="subtitle2">Variations</Typography>
                        {plan.variations.costOptimized.map((item) => (
                          <Typography key={`cost-${item}`} variant="body2" sx={{ color: "var(--muted)" }}>
                            Cost-optimized: {item}
                          </Typography>
                        ))}
                        {plan.variations.highPerformance.map((item) => (
                          <Typography key={`perf-${item}`} variant="body2" sx={{ color: "var(--muted)" }}>
                            High-performance: {item}
                          </Typography>
                        ))}
                        {plan.variations.enterprise.map((item) => (
                          <Typography key={`ent-${item}`} variant="body2" sx={{ color: "var(--muted)" }}>
                            Enterprise: {item}
                          </Typography>
                        ))}
                      </Stack>
                      <Stack spacing={0.8}>
                        <Typography variant="subtitle2">Use Cases</Typography>
                        {plan.useCases.map((item) => (
                          <Typography key={item} variant="body2" sx={{ color: "var(--muted)" }}>
                            {item}
                          </Typography>
                        ))}
                      </Stack>
                      <Stack spacing={0.8}>
                        <Typography variant="subtitle2">Pros / Cons</Typography>
                        {plan.pros.map((item) => (
                          <Typography key={`pro-${item}`} variant="body2" sx={{ color: "var(--muted)" }}>
                            Pro: {item}
                          </Typography>
                        ))}
                        {plan.cons.map((item) => (
                          <Typography key={`con-${item}`} variant="body2" sx={{ color: "var(--muted)" }}>
                            Con: {item}
                          </Typography>
                        ))}
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
