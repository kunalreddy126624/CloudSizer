import type { RecommendationRequest } from "@/lib/types";

export interface SavedScenario {
  id: string;
  name: string;
  request: RecommendationRequest;
  updated_at: string;
}

export interface ComparisonHistoryEntry {
  id: string;
  label: string;
  request: RecommendationRequest;
  top_provider: string;
  estimated_monthly_cost_usd: number;
  created_at: string;
}

export interface PendingEstimatorScenario {
  name: string;
  request: RecommendationRequest;
  source: "advisor" | "saved_estimate";
  estimate_id?: number;
  imported_at: string;
}

export interface PendingArchitectScenario {
  name: string;
  request: RecommendationRequest;
  source: "estimator" | "saved_estimate";
  estimate_id?: number;
  prompt_override?: string;
  imported_at: string;
}

export interface ArchitectCanvasDraft {
  id?: string;
  name?: string;
  prompt: string;
  selected_providers: string[];
  diagram_style?: string;
  request_context: RecommendationRequest | null;
  plan: Record<string, unknown>;
  zone_overrides?: Record<string, unknown>;
  lane_overrides?: Record<string, unknown>;
  saved_at: string;
}

export interface SavedArchitectureDraft extends ArchitectCanvasDraft {
  id: string;
  name: string;
}

const SAVED_SCENARIOS_KEY = "cloudsizer.saved-scenarios";
const HISTORY_KEY = "cloudsizer.comparison-history";
const PENDING_ESTIMATOR_SCENARIO_KEY = "cloudsizer.pending-estimator-scenario";
const PENDING_ARCHITECT_SCENARIO_KEY = "cloudsizer.pending-architect-scenario";
const ARCHITECT_CANVAS_DRAFT_KEY = "cloudsizer.architect-canvas-draft";
const SAVED_ARCHITECTURES_KEY = "cloudsizer.saved-architectures";

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function loadSavedScenarios() {
  return parseJson<SavedScenario[]>(window.localStorage.getItem(SAVED_SCENARIOS_KEY), []);
}

export function storeSavedScenarios(scenarios: SavedScenario[]) {
  window.localStorage.setItem(SAVED_SCENARIOS_KEY, JSON.stringify(scenarios));
}

export function loadComparisonHistory() {
  return parseJson<ComparisonHistoryEntry[]>(window.localStorage.getItem(HISTORY_KEY), []);
}

export function storeComparisonHistory(history: ComparisonHistoryEntry[]) {
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function loadPendingEstimatorScenario() {
  return parseJson<PendingEstimatorScenario | null>(
    window.localStorage.getItem(PENDING_ESTIMATOR_SCENARIO_KEY),
    null
  );
}

export function storePendingEstimatorScenario(scenario: PendingEstimatorScenario) {
  window.localStorage.setItem(PENDING_ESTIMATOR_SCENARIO_KEY, JSON.stringify(scenario));
}

export function clearPendingEstimatorScenario() {
  window.localStorage.removeItem(PENDING_ESTIMATOR_SCENARIO_KEY);
}

export function loadPendingArchitectScenario() {
  return parseJson<PendingArchitectScenario | null>(
    window.localStorage.getItem(PENDING_ARCHITECT_SCENARIO_KEY),
    null
  );
}

export function storePendingArchitectScenario(scenario: PendingArchitectScenario) {
  window.localStorage.setItem(PENDING_ARCHITECT_SCENARIO_KEY, JSON.stringify(scenario));
}

export function clearPendingArchitectScenario() {
  window.localStorage.removeItem(PENDING_ARCHITECT_SCENARIO_KEY);
}

export function loadArchitectCanvasDraft() {
  return parseJson<ArchitectCanvasDraft | null>(
    window.localStorage.getItem(ARCHITECT_CANVAS_DRAFT_KEY),
    null
  );
}

export function storeArchitectCanvasDraft(draft: ArchitectCanvasDraft) {
  window.localStorage.setItem(ARCHITECT_CANVAS_DRAFT_KEY, JSON.stringify(draft));
}

export function clearArchitectCanvasDraft() {
  window.localStorage.removeItem(ARCHITECT_CANVAS_DRAFT_KEY);
}

export function loadSavedArchitectureDrafts() {
  return parseJson<SavedArchitectureDraft[]>(window.localStorage.getItem(SAVED_ARCHITECTURES_KEY), []);
}

export function storeSavedArchitectureDrafts(drafts: SavedArchitectureDraft[]) {
  window.localStorage.setItem(SAVED_ARCHITECTURES_KEY, JSON.stringify(drafts));
}

export function upsertSavedArchitectureDraft(draft: SavedArchitectureDraft) {
  const drafts = loadSavedArchitectureDrafts();
  const nextDrafts = [draft, ...drafts.filter((entry) => entry.id !== draft.id)];
  storeSavedArchitectureDrafts(nextDrafts);
}

export function deleteSavedArchitectureDraft(draftId: string) {
  const drafts = loadSavedArchitectureDrafts();
  storeSavedArchitectureDrafts(drafts.filter((draft) => draft.id !== draftId));
}
