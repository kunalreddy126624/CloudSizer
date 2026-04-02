from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


DeploymentScope = Literal["hybrid", "multi_cloud", "edge", "hybrid_multi_cloud"]
SourceKind = Literal["api", "database", "stream", "file", "iot", "saas"]
ProcessingMode = Literal["batch", "stream", "micro_batch", "hybrid"]
TargetZone = Literal["bronze", "silver", "gold", "feature_store", "serving"]


class NoodleSourceSystem(BaseModel):
    name: str
    kind: SourceKind
    environment: Literal["on_prem", "aws", "azure", "gcp", "edge", "saas"]
    format_hint: str = ""
    change_pattern: Literal["append", "cdc", "event", "snapshot"] = "snapshot"


class NoodlePipelineIntent(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    business_goal: str = Field(min_length=10, max_length=500)
    deployment_scope: DeploymentScope
    latency_slo: Literal["seconds", "minutes", "hours", "daily"] = "minutes"
    requires_ml_features: bool = False
    requires_realtime_serving: bool = False
    contains_sensitive_data: bool = False
    target_consumers: list[str] = Field(default_factory=list)
    sources: list[NoodleSourceSystem] = Field(min_length=1)


class NoodleConnectorPlan(BaseModel):
    source_name: str
    connector_type: str
    ingestion_mode: ProcessingMode
    landing_topic: str
    landing_zone: TargetZone
    notes: list[str] = Field(default_factory=list)


class NoodleProcessingStage(BaseModel):
    name: str
    engine: str
    mode: ProcessingMode
    purpose: str
    outputs: list[TargetZone] = Field(default_factory=list)


class NoodleGovernanceControl(BaseModel):
    name: str
    category: Literal["access", "privacy", "compliance", "quality", "residency"]
    enforcement_point: str
    rationale: str


class NoodleAiCapability(BaseModel):
    name: str
    function: str
    activation_rule: str


class NoodleObservabilityCapability(BaseModel):
    name: str
    metric_family: str
    sink: str


class NoodleTechnologyMapping(BaseModel):
    layer: str
    primary: list[str]
    optional: list[str] = Field(default_factory=list)


class NoodleUseCase(BaseModel):
    name: str
    summary: str
    involved_layers: list[str]


class NoodleScalabilityConcern(BaseModel):
    concern: str
    strategy: str


class NoodlePipelinePlanResponse(BaseModel):
    intent: NoodlePipelineIntent
    connectors: list[NoodleConnectorPlan]
    processing_stages: list[NoodleProcessingStage]
    governance_controls: list[NoodleGovernanceControl]
    ai_capabilities: list[NoodleAiCapability]
    observability: list[NoodleObservabilityCapability]
    serving_patterns: list[str]
    workflow_template: str


class NoodleReferenceSpec(BaseModel):
    id: str
    name: str
    summary: str
    tags: list[str]
    sample_intent: NoodlePipelineIntent


class NoodleArchitectureOverview(BaseModel):
    name: str
    objective: str
    textual_diagram: str
    core_capabilities: list[str]
    component_breakdown: dict[str, list[str]]
    technology_mapping: list[NoodleTechnologyMapping]
    use_cases: list[NoodleUseCase]
    scalability: list[NoodleScalabilityConcern]


class NoodlePlatformBlueprint(BaseModel):
    overview: NoodleArchitectureOverview
    lakehouse_layout: dict[str, list[str]]
    orchestration_stack: list[str]
    metadata_stack: list[str]
    governance_stack: list[str]
    ai_stack: list[str]
    observability_stack: list[str]


class NoodleServiceEndpoint(BaseModel):
    method: Literal["GET", "POST", "PUT", "DELETE"]
    path: str
    summary: str


class NoodleMicroserviceSpec(BaseModel):
    name: str
    responsibility: str
    domain: str
    deployment_pattern: str
    apis: list[NoodleServiceEndpoint]
    dependencies: list[str] = Field(default_factory=list)


class NoodleMicroserviceCatalogResponse(BaseModel):
    services: list[NoodleMicroserviceSpec]


class NoodleMicroserviceDetailResponse(BaseModel):
    service: NoodleMicroserviceSpec


class NoodleWorkflowStartRequest(BaseModel):
    pipeline_name: str
    workflow_template: str
    trigger: Literal["manual", "event", "schedule"] = "manual"


class NoodleWorkflowRunStatus(BaseModel):
    workflow_id: str
    service: str
    status: Literal["accepted", "running", "completed", "failed"]
    detail: str


class NoodleSchemaInferenceRequest(BaseModel):
    source_name: str
    format_hint: str
    sample_record: dict[str, object] = Field(default_factory=dict)


class NoodleSchemaField(BaseModel):
    name: str
    inferred_type: str
    nullable: bool


class NoodleSchemaInferenceResponse(BaseModel):
    source_name: str
    fields: list[NoodleSchemaField]
    drift_risk: Literal["low", "medium", "high"]


class NoodleRoutingRequest(BaseModel):
    dataset_name: str
    latency_slo: Literal["seconds", "minutes", "hours", "daily"]
    contains_sensitive_data: bool = False
    requires_realtime_serving: bool = False
    consumers: list[str] = Field(default_factory=list)


class NoodleRoutingDecisionResponse(BaseModel):
    dataset_name: str
    route_to: list[TargetZone]
    rationale: list[str]


class NoodleConnectorRegistrationRequest(BaseModel):
    name: str
    source_kind: SourceKind
    runtime: str


class NoodleConnectorRegistrationResponse(BaseModel):
    status: Literal["registered"]
    connector_name: str
    runtime: str


class NoodleJobSubmissionRequest(BaseModel):
    pipeline_name: str
    stage_name: str
    mode: ProcessingMode


class NoodleJobSubmissionResponse(BaseModel):
    status: Literal["accepted"]
    job_id: str
    execution_plane: str
    detail: str


class NoodleEnrichmentRequest(BaseModel):
    dataset_name: str
    tasks: list[str] = Field(default_factory=list)


class NoodleEnrichmentResponse(BaseModel):
    dataset_name: str
    tasks: list[str]
    execution_mode: Literal["async", "sync"]


class NoodleQualityCheckRequest(BaseModel):
    dataset_name: str
    checks: list[str] = Field(default_factory=list)


class NoodleQualityCheckResponse(BaseModel):
    dataset_name: str
    score: float
    passed_checks: list[str]
    failed_checks: list[str]


class NoodleDatasetSummary(BaseModel):
    dataset_name: str
    zone: TargetZone
    owner: str
    classification: str


class NoodleLineageResponse(BaseModel):
    asset_id: str
    upstream_assets: list[str]
    downstream_assets: list[str]


class NoodlePolicyEvaluationRequest(BaseModel):
    asset_name: str
    contains_sensitive_data: bool = False
    residency: str = "global"


class NoodlePolicyEvaluationResponse(BaseModel):
    asset_name: str
    passed: bool
    enforced_controls: list[str]


class NoodleAccessCheckRequest(BaseModel):
    principal: str
    asset_name: str
    action: Literal["read", "write", "admin"]


class NoodleAccessCheckResponse(BaseModel):
    principal: str
    asset_name: str
    action: str
    allowed: bool
    reason: str


class NoodleDataProduct(BaseModel):
    name: str
    interface: str
    consumers: list[str]


class NoodlePipelineObservability(BaseModel):
    pipeline_name: str
    freshness_minutes: int
    error_rate_percent: float
    monthly_cost_usd: float
    quality_score: float
