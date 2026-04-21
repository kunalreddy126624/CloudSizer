import type {
  CloudProvider,
  EstimationAdvisorResponse,
  NoodlePipelineDesignerDocument,
  NoodlePipelineIntent,
  NoodleSavedArchitectureContext,
  NoodleSourceSystem,
  RecommendationRequest
} from "@/lib/types";
import type { DiagramPlan, DiagramStyle } from "@/lib/architect-diagram";
import type { SavedArchitectureDraft } from "@/lib/scenario-store";

function compactText(values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)).join(" ");
}

export function buildSystemDesignFromPlan(plan: DiagramPlan) {
  return compactText([
    plan.summary,
    plan.components.length ? `Components: ${plan.components.join(", ")}.` : "",
    plan.dataFlow.length ? `Data flow: ${plan.dataFlow.join(" -> ")}.` : "",
    plan.scalingStrategy.length ? `Scaling: ${plan.scalingStrategy.join(", ")}.` : "",
    plan.securityConsiderations.length ? `Security: ${plan.securityConsiderations.join(", ")}.` : ""
  ]);
}

export function buildArchitectureContextFromPlan(
  name: string,
  prompt: string,
  selectedProviders: string[],
  diagramStyle: DiagramStyle | string | null | undefined,
  plan: DiagramPlan,
  savedAt?: string | null
): NoodleSavedArchitectureContext {
  return {
    name,
    prompt,
    selected_providers: selectedProviders,
    diagram_style: diagramStyle ?? null,
    summary: plan.summary,
    system_design: buildSystemDesignFromPlan(plan),
    assumptions: plan.assumptions,
    components: plan.components,
    cloud_services: plan.cloudServices,
    data_flow: plan.dataFlow,
    scaling_strategy: plan.scalingStrategy,
    security_considerations: plan.securityConsiderations,
    saved_at: savedAt ?? null
  };
}

export function buildArchitectureContextFromSavedDraft(
  savedArchitecture?: SavedArchitectureDraft | null
): NoodleSavedArchitectureContext | null {
  if (!savedArchitecture) {
    return null;
  }

  const plan = savedArchitecture.plan as unknown as DiagramPlan;
  return buildArchitectureContextFromPlan(
    savedArchitecture.name,
    savedArchitecture.prompt,
    savedArchitecture.selected_providers,
    savedArchitecture.diagram_style ?? null,
    plan,
    savedArchitecture.saved_at
  );
}

export function buildEstimatorContextBlocks(options: {
  preferredProviders: CloudProvider[];
  monthlyBudget: number | "" | null;
  inferredRequest?: RecommendationRequest | null;
  estimate?: EstimationAdvisorResponse | null;
}) {
  const blocks = [
    options.preferredProviders.length
      ? `Preferred providers: ${options.preferredProviders.join(", ")}.`
      : "",
    typeof options.monthlyBudget === "number"
      ? `Monthly budget: ${options.monthlyBudget} USD.`
      : "",
    options.inferredRequest
      ? compactText([
          `Workload type: ${options.inferredRequest.workload_type}.`,
          `Region: ${options.inferredRequest.region}.`,
          `Users: ${options.inferredRequest.user_count}.`,
          `Storage: ${options.inferredRequest.storage_gb} GB.`,
          `Availability tier: ${options.inferredRequest.availability_tier}.`,
          options.inferredRequest.requires_disaster_recovery ? "Disaster recovery required." : "Disaster recovery not required.",
          options.inferredRequest.requires_managed_database ? "Managed database required." : "Managed database not required."
        ])
      : "",
    options.estimate
      ? compactText([
          options.estimate.summary,
          options.estimate.recommended_provider
            ? `Recommended provider: ${options.estimate.recommended_provider}.`
            : "",
          options.estimate.recommended_service_families.length
            ? `Recommended service families: ${options.estimate.recommended_service_families.join(", ")}.`
            : ""
        ])
      : ""
  ];

  return blocks.filter(Boolean);
}

export function buildArchitectContextBlocks(plan: DiagramPlan) {
  return [
    `Pattern: ${plan.patternLabel}. Scenario: ${plan.scenarioLabel}.`,
    plan.useCases.length ? `Use cases: ${plan.useCases.join(", ")}.` : "",
    plan.pros.length ? `Pros: ${plan.pros.join(", ")}.` : "",
    plan.cons.length ? `Risks: ${plan.cons.join(", ")}.` : ""
  ].filter(Boolean);
}

export function buildMomoIntent(intentName: string, sources: NoodleSourceSystem[]): NoodlePipelineIntent {
  return {
    name: intentName,
    business_goal: `Design and operationalize the ${intentName} pipeline with stable orchestration and governed delivery.`,
    deployment_scope: "multi_cloud",
    latency_slo: "minutes",
    requires_ml_features: false,
    requires_realtime_serving: false,
    contains_sensitive_data: false,
    target_consumers: ["pipeline_designer"],
    sources
  };
}

export function buildPipelineContextBlocks(document: NoodlePipelineDesignerDocument) {
  return [
    `Pipeline name: ${document.name}. Status: ${document.status}.`,
    `Nodes: ${document.nodes.map((node) => `${node.label} (${node.kind})`).slice(0, 8).join(", ")}.`,
    `Deployment target: ${document.deployment.deploy_target}. Schedule trigger: ${document.schedule.trigger}.`
  ];
}
