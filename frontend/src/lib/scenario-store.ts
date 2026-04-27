import type {
  NoodleArchitectureOverview,
  NoodleArchitecturePrinciple,
  NoodleDesignerDeployment,
  NoodleSchedulerPlan,
  NoodlePipelineDesignerDocument,
  NoodleOrchestratorPlan,
  NoodlePipelineIntent,
  PendingNoodleSchedulerSession,
  RecommendationRequest
} from "@/lib/types";

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

export interface PendingNoodleDesignerSession {
  intent: NoodlePipelineIntent;
  workflow_template?: string | null;
  architecture_overview?: NoodleArchitectureOverview | null;
  design_principles?: NoodleArchitecturePrinciple[];
  saved_architecture?: SavedArchitectureDraft | null;
  agent_momo_brief?: string | null;
  deployment_seed?: NoodleDesignerDeployment | null;
  pipeline_document?: NoodlePipelineDesignerDocument | null;
  orchestrator_plan?: NoodleOrchestratorPlan | null;
  opened_at: string;
}

const SAVED_SCENARIOS_KEY = "cloudsizer.saved-scenarios";
const HISTORY_KEY = "cloudsizer.comparison-history";
const PENDING_ESTIMATOR_SCENARIO_KEY = "cloudsizer.pending-estimator-scenario";
const PENDING_ARCHITECT_SCENARIO_KEY = "cloudsizer.pending-architect-scenario";
const ARCHITECT_CANVAS_DRAFT_KEY = "cloudsizer.architect-canvas-draft";
const SAVED_ARCHITECTURES_KEY = "cloudsizer.saved-architectures";
const NOODLE_PIPELINE_DRAFT_KEY = "cloudsizer.noodle-pipeline-draft";
const SAVED_NOODLE_PIPELINES_KEY = "cloudsizer.saved-noodle-pipelines";
const PENDING_NOODLE_DESIGNER_SESSION_KEY = "cloudsizer.pending-noodle-designer-session";
const SAVED_NOODLE_SCHEDULER_PLANS_KEY = "cloudsizer.saved-noodle-scheduler-plans";
const PENDING_NOODLE_SCHEDULER_SESSION_KEY = "cloudsizer.pending-noodle-scheduler-session";
const MAX_SAVED_NOODLE_PIPELINES = 8;

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

function isQuotaExceededError(error: unknown) {
  return error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
}

function readStorageValue(key: string) {
  return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
}

function removeStorageValue(key: string) {
  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
}

function setStorageWithQuotaFallback(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
    window.sessionStorage.removeItem(key);
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }

    window.localStorage.removeItem(key);
    window.sessionStorage.setItem(key, value);
  }
}

function compactNoodleRun(run: NoodlePipelineDesignerDocument["runs"][number]) {
  return {
    ...run,
    logs: [],
    repaired_task_ids: [],
    reused_task_ids: [],
    batch_session_ids: [],
    cached_outputs: [],
    sink_bindings: [],
    lineage_records: [],
    repair_plan: run.repair_plan
      ? {
          ...run.repair_plan,
          rerun_task_ids: [],
          reused_task_ids: [],
          downstream_task_ids: [],
          validation_issues: []
        }
      : null
  };
}

function compactNoodleBatchSession(session: NonNullable<NoodlePipelineDesignerDocument["batch_sessions"]>[number]) {
  return {
    ...session,
    related_run_ids: [],
    attempts: []
  };
}

function compactNoodlePipelineDocument(document: NoodlePipelineDesignerDocument): NoodlePipelineDesignerDocument {
  return {
    ...document,
    runs: (document.runs ?? []).map(compactNoodleRun),
    batch_sessions: (document.batch_sessions ?? []).map(compactNoodleBatchSession)
  };
}

function compactSavedNoodlePipelines(documents: NoodlePipelineDesignerDocument[]) {
  return documents.slice(0, MAX_SAVED_NOODLE_PIPELINES).map(compactNoodlePipelineDocument);
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
    readStorageValue(ARCHITECT_CANVAS_DRAFT_KEY),
    null
  );
}

export function storeArchitectCanvasDraft(draft: ArchitectCanvasDraft) {
  setStorageWithQuotaFallback(ARCHITECT_CANVAS_DRAFT_KEY, JSON.stringify(draft));
}

export function clearArchitectCanvasDraft() {
  removeStorageValue(ARCHITECT_CANVAS_DRAFT_KEY);
}

export function loadSavedArchitectureDrafts() {
  return parseJson<SavedArchitectureDraft[]>(readStorageValue(SAVED_ARCHITECTURES_KEY), []);
}

export function storeSavedArchitectureDrafts(drafts: SavedArchitectureDraft[]) {
  setStorageWithQuotaFallback(SAVED_ARCHITECTURES_KEY, JSON.stringify(drafts));
}

export function mergeSavedArchitectureDrafts(
  drafts: SavedArchitectureDraft[],
  draft: SavedArchitectureDraft
) {
  return [draft, ...drafts.filter((entry) => entry.id !== draft.id)];
}

export function upsertSavedArchitectureDraft(draft: SavedArchitectureDraft) {
  const drafts = loadSavedArchitectureDrafts();
  const nextDrafts = mergeSavedArchitectureDrafts(drafts, draft);
  storeSavedArchitectureDrafts(nextDrafts);
}

export function deleteSavedArchitectureDraft(draftId: string) {
  const drafts = loadSavedArchitectureDrafts();
  storeSavedArchitectureDrafts(drafts.filter((draft) => draft.id !== draftId));
}

export function loadNoodlePipelineDraft() {
  return parseJson<NoodlePipelineDesignerDocument | null>(
    readStorageValue(NOODLE_PIPELINE_DRAFT_KEY),
    null
  );
}

export function storeNoodlePipelineDraft(draft: NoodlePipelineDesignerDocument) {
  setStorageWithQuotaFallback(NOODLE_PIPELINE_DRAFT_KEY, JSON.stringify(compactNoodlePipelineDocument(draft)));
}

export function clearNoodlePipelineDraft() {
  removeStorageValue(NOODLE_PIPELINE_DRAFT_KEY);
}

export function loadSavedNoodlePipelines() {
  return parseJson<NoodlePipelineDesignerDocument[]>(
    readStorageValue(SAVED_NOODLE_PIPELINES_KEY),
    []
  );
}

export function storeSavedNoodlePipelines(documents: NoodlePipelineDesignerDocument[]) {
  setStorageWithQuotaFallback(
    SAVED_NOODLE_PIPELINES_KEY,
    JSON.stringify(compactSavedNoodlePipelines(documents))
  );
}

export function mergeSavedNoodlePipelines(
  documents: NoodlePipelineDesignerDocument[],
  document: NoodlePipelineDesignerDocument
) {
  return [document, ...documents.filter((entry) => entry.id !== document.id)].slice(0, MAX_SAVED_NOODLE_PIPELINES);
}

export function upsertSavedNoodlePipeline(document: NoodlePipelineDesignerDocument) {
  const documents = loadSavedNoodlePipelines();
  storeSavedNoodlePipelines(mergeSavedNoodlePipelines(documents, document));
}

export function appendSavedNoodlePipeline(document: NoodlePipelineDesignerDocument) {
  const documents = loadSavedNoodlePipelines();
  storeSavedNoodlePipelines([document, ...documents]);
}

export function loadPendingNoodleDesignerSession() {
  return parseJson<PendingNoodleDesignerSession | null>(
    readStorageValue(PENDING_NOODLE_DESIGNER_SESSION_KEY),
    null
  );
}

export function storePendingNoodleDesignerSession(session: PendingNoodleDesignerSession) {
  const compactSession: PendingNoodleDesignerSession = {
    ...session,
    pipeline_document: session.pipeline_document ? compactNoodlePipelineDocument(session.pipeline_document) : null
  };
  setStorageWithQuotaFallback(PENDING_NOODLE_DESIGNER_SESSION_KEY, JSON.stringify(compactSession));
}

export function clearPendingNoodleDesignerSession() {
  removeStorageValue(PENDING_NOODLE_DESIGNER_SESSION_KEY);
}

export function loadSavedNoodleSchedulerPlans() {
  return parseJson<NoodleSchedulerPlan[]>(
    readStorageValue(SAVED_NOODLE_SCHEDULER_PLANS_KEY),
    []
  );
}

export function storeSavedNoodleSchedulerPlans(plans: NoodleSchedulerPlan[]) {
  setStorageWithQuotaFallback(SAVED_NOODLE_SCHEDULER_PLANS_KEY, JSON.stringify(plans));
}

export function mergeSavedNoodleSchedulerPlans(
  plans: NoodleSchedulerPlan[],
  plan: NoodleSchedulerPlan
) {
  return [plan, ...plans.filter((entry) => entry.id !== plan.id)];
}

export function upsertSavedNoodleSchedulerPlan(plan: NoodleSchedulerPlan) {
  const plans = loadSavedNoodleSchedulerPlans();
  storeSavedNoodleSchedulerPlans(mergeSavedNoodleSchedulerPlans(plans, plan));
}

export function loadPendingNoodleSchedulerSession() {
  const localSession = parseJson<PendingNoodleSchedulerSession | null>(
    readStorageValue(PENDING_NOODLE_SCHEDULER_SESSION_KEY),
    null
  );
  if (localSession) {
    return localSession;
  }

  return parseJson<PendingNoodleSchedulerSession | null>(
    window.sessionStorage.getItem(PENDING_NOODLE_SCHEDULER_SESSION_KEY),
    null
  );
}

export function storePendingNoodleSchedulerSession(session: PendingNoodleSchedulerSession) {
  const compactSession: PendingNoodleSchedulerSession = {
    source: session.source,
    intent_name: session.intent_name ?? null,
    pipeline_id: session.pipeline_id ?? session.document?.id ?? null,
    pipeline_name: session.pipeline_name ?? session.document?.name ?? null,
    orchestrator_plan: session.orchestrator_plan ?? null,
    opened_at: session.opened_at
  };
  const minimalSession: PendingNoodleSchedulerSession = {
    source: compactSession.source,
    intent_name: compactSession.intent_name ?? null,
    pipeline_id: compactSession.pipeline_id ?? null,
    pipeline_name: compactSession.pipeline_name ?? null,
    opened_at: compactSession.opened_at
  };

  try {
    window.localStorage.setItem(PENDING_NOODLE_SCHEDULER_SESSION_KEY, JSON.stringify(compactSession));
    window.sessionStorage.removeItem(PENDING_NOODLE_SCHEDULER_SESSION_KEY);
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error;
    }

    try {
      window.localStorage.setItem(PENDING_NOODLE_SCHEDULER_SESSION_KEY, JSON.stringify(minimalSession));
      window.sessionStorage.removeItem(PENDING_NOODLE_SCHEDULER_SESSION_KEY);
    } catch (minimalError) {
      if (!isQuotaExceededError(minimalError)) {
        throw minimalError;
      }

      window.localStorage.removeItem(PENDING_NOODLE_SCHEDULER_SESSION_KEY);

      try {
        window.sessionStorage.setItem(PENDING_NOODLE_SCHEDULER_SESSION_KEY, JSON.stringify(compactSession));
      } catch (sessionError) {
        if (!isQuotaExceededError(sessionError)) {
          throw sessionError;
        }

        window.sessionStorage.setItem(PENDING_NOODLE_SCHEDULER_SESSION_KEY, JSON.stringify(minimalSession));
      }
    }
  }
}

export function clearPendingNoodleSchedulerSession() {
  removeStorageValue(PENDING_NOODLE_SCHEDULER_SESSION_KEY);
}
