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
  source: "saved_estimate";
  estimate_id?: number;
  imported_at: string;
}

export interface PendingArchitectScenario {
  name: string;
  request: RecommendationRequest;
  source: "estimator" | "saved_estimate";
  estimate_id?: number;
  imported_at: string;
}

const SAVED_SCENARIOS_KEY = "cloudsizer.saved-scenarios";
const HISTORY_KEY = "cloudsizer.comparison-history";
const PENDING_ESTIMATOR_SCENARIO_KEY = "cloudsizer.pending-estimator-scenario";
const PENDING_ARCHITECT_SCENARIO_KEY = "cloudsizer.pending-architect-scenario";

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
