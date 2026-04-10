from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


DeploymentScope = Literal["hybrid", "multi_cloud", "edge", "hybrid_multi_cloud"]
SourceKind = Literal["api", "database", "stream", "file", "iot", "saas", "github"]
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


class NoodleArchitecturePrinciple(BaseModel):
    title: str
    directive: str
    rationale: str


class NoodlePlatformPlane(BaseModel):
    name: str
    responsibility: str
    components: list[str] = Field(default_factory=list)


class NoodleRepositorySection(BaseModel):
    root: str
    paths: list[str] = Field(default_factory=list)


class NoodleRecommendedStackItem(BaseModel):
    layer: str
    technologies: list[str] = Field(default_factory=list)


class NoodleBuildPhase(BaseModel):
    phase: str
    outcomes: list[str] = Field(default_factory=list)


class NoodleExecutionFlowStep(BaseModel):
    step: str
    description: str


class NoodleTaskState(BaseModel):
    name: str
    description: str


class NoodleExecutionEngineBlueprint(BaseModel):
    summary: str
    flow: list[NoodleExecutionFlowStep] = Field(default_factory=list)
    task_states: list[NoodleTaskState] = Field(default_factory=list)


class NoodleSavedArchitectureContext(BaseModel):
    name: str
    prompt: str
    selected_providers: list[str] = Field(default_factory=list)
    diagram_style: str | None = None
    summary: str = ""
    assumptions: list[str] = Field(default_factory=list)
    components: list[str] = Field(default_factory=list)
    cloud_services: list[str] = Field(default_factory=list)
    data_flow: list[str] = Field(default_factory=list)
    scaling_strategy: list[str] = Field(default_factory=list)
    security_considerations: list[str] = Field(default_factory=list)
    saved_at: str | None = None


class NoodleArchitectureAlignmentItem(BaseModel):
    area: str
    guidance: str


TaskExecutionPlane = Literal["control_plane", "airflow", "worker", "quality", "serving"]
DesignerTrigger = Literal["manual", "schedule", "event", "if"]
DesignerOrchestrationMode = Literal["tasks", "plan"]


class NoodleOrchestratorTaskPlan(BaseModel):
    id: str
    node_id: str | None = None
    name: str
    stage: str
    plugin: str
    execution_plane: TaskExecutionPlane
    depends_on: list[str] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)
    notes: str = ""


class NoodleOrchestratorPlan(BaseModel):
    id: str
    name: str
    objective: str
    trigger: DesignerTrigger = "manual"
    execution_target: str
    tasks: list[NoodleOrchestratorTaskPlan] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class NoodlePipelinePlanningRequest(BaseModel):
    intent: NoodlePipelineIntent
    architecture_context: NoodleSavedArchitectureContext | None = None
    architecture_overview: NoodleArchitectureOverview | None = None
    practice_principles: list[NoodleArchitecturePrinciple] = Field(default_factory=list)


class NoodlePipelinePlanResponse(BaseModel):
    intent: NoodlePipelineIntent
    connectors: list[NoodleConnectorPlan]
    processing_stages: list[NoodleProcessingStage]
    governance_controls: list[NoodleGovernanceControl]
    ai_capabilities: list[NoodleAiCapability]
    observability: list[NoodleObservabilityCapability]
    serving_patterns: list[str]
    workflow_template: str
    architecture_context_name: str | None = None
    practice_principles_applied: list[str] = Field(default_factory=list)
    architecture_alignment: list[NoodleArchitectureAlignmentItem] = Field(default_factory=list)
    agent_momo_brief: str = ""
    orchestrator_plan: NoodleOrchestratorPlan | None = None


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
    design_principles: list[NoodleArchitecturePrinciple]
    platform_planes: list[NoodlePlatformPlane]
    repository_layout: list[NoodleRepositorySection]
    recommended_stack: list[NoodleRecommendedStackItem]
    build_phases: list[NoodleBuildPhase]
    execution_engine: NoodleExecutionEngineBlueprint


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
    trigger: DesignerTrigger = "manual"


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


DesignerNodeKind = Literal["source", "ingest", "transform", "cache", "quality", "feature", "serve"]
DesignerDocumentStatus = Literal["draft", "published"]
DesignerTargetZone = Literal["bronze", "silver", "gold", "feature_store", "serving", "control_plane"]
DesignerTransformationMode = Literal["python", "sql", "dbt", "spark_sql", "custom"]
DesignerRunStatus = Literal["queued", "running", "success", "failed", "cancelled"]
DesignerTaskRunState = Literal["pending", "queued", "running", "success", "failed", "retrying", "skipped", "cancelled"]
DesignerLogLevel = Literal["log", "info", "warn"]
DesignerDeploymentProvider = Literal["github", "gitlab", "bitbucket", "custom"]
DesignerDeploymentTarget = Literal["local_docker", "kubernetes", "airflow_worker", "worker_runtime", "custom"]


class NoodleDesignerParam(BaseModel):
    key: str
    value: str


class NoodleDesignerPosition(BaseModel):
    x: float
    y: float


class NoodleDesignerNode(BaseModel):
    id: str
    label: str
    kind: DesignerNodeKind
    position: NoodleDesignerPosition
    params: list[NoodleDesignerParam] = Field(default_factory=list)


class NoodleDesignerEdge(BaseModel):
    id: str
    source: str
    target: str


class NoodleDesignerConnectionRef(BaseModel):
    id: str
    name: str
    plugin: str
    environment: str
    auth_ref: str
    params: list[NoodleDesignerParam] = Field(default_factory=list)
    notes: str


class NoodleDesignerCodeRepository(BaseModel):
    provider: DesignerDeploymentProvider = "github"
    connection_id: str | None = None
    repository: str = ""
    branch: str = "main"
    backend_path: str = "app"
    workflow_ref: str = ".github/workflows/deploy.yml"


class NoodleDesignerDeployment(BaseModel):
    enabled: bool = False
    deploy_target: DesignerDeploymentTarget = "local_docker"
    repository: NoodleDesignerCodeRepository = Field(default_factory=NoodleDesignerCodeRepository)
    build_command: str = "docker build -t noodle-pipeline-backend ."
    deploy_command: str = "docker compose up -d --build"
    artifact_name: str = "noodle-pipeline-backend"
    notes: str = ""


class NoodleDesignerMetadataAsset(BaseModel):
    id: str
    name: str
    zone: DesignerTargetZone
    owner: str
    classification: str
    tags: list[str] = Field(default_factory=list)


class NoodleDesignerSchemaField(BaseModel):
    id: str
    name: str
    type: str
    nullable: bool
    description: str


class NoodleDesignerSchema(BaseModel):
    id: str
    name: str
    source_connection_id: str | None = None
    fields: list[NoodleDesignerSchemaField] = Field(default_factory=list)


class NoodleDesignerTransformation(BaseModel):
    id: str
    node_id: str | None = None
    name: str
    plugin: str
    mode: DesignerTransformationMode = "python"
    description: str = ""
    code: str = ""
    config_json: str = "{}"
    tags: list[str] = Field(default_factory=list)


class NoodleDesignerSchedule(BaseModel):
    trigger: DesignerTrigger = "manual"
    cron: str = ""
    timezone: str = "UTC"
    enabled: bool = False
    concurrency_policy: Literal["allow", "forbid", "replace"] = "forbid"
    orchestration_mode: DesignerOrchestrationMode = "tasks"
    if_condition: str = ""


class NoodleDesignerRunTask(BaseModel):
    id: str
    node_id: str
    node_label: str
    state: DesignerTaskRunState
    started_at: str | None = None
    finished_at: str | None = None


class NoodleDesignerRunLog(BaseModel):
    id: str
    timestamp: str
    level: DesignerLogLevel
    message: str
    node_id: str | None = None


class NoodleDesignerCachedOutput(BaseModel):
    id: str
    node_id: str
    node_label: str
    source_node_id: str | None = None
    source_node_label: str | None = None
    format: Literal["jsonl", "json", "csv", "text"] = "jsonl"
    content_type: str = "application/x-ndjson"
    summary: str = ""
    preview_text: str = ""
    preview_bytes: int = 0
    captured_bytes: int = 0
    max_capture_bytes: int = 0
    truncated: bool = False
    approx_records: int = 0


class NoodleDesignerRun(BaseModel):
    id: str
    label: str
    orchestrator: str
    status: DesignerRunStatus
    trigger: DesignerTrigger
    orchestration_mode: DesignerOrchestrationMode = "tasks"
    started_at: str
    finished_at: str | None = None
    task_runs: list[NoodleDesignerRunTask] = Field(default_factory=list)
    logs: list[NoodleDesignerRunLog] = Field(default_factory=list)
    cached_outputs: list[NoodleDesignerCachedOutput] = Field(default_factory=list)


class NoodlePipelineDocument(BaseModel):
    id: str
    name: str
    status: DesignerDocumentStatus
    version: int
    nodes: list[NoodleDesignerNode] = Field(default_factory=list)
    edges: list[NoodleDesignerEdge] = Field(default_factory=list)
    connection_refs: list[NoodleDesignerConnectionRef] = Field(default_factory=list)
    metadata_assets: list[NoodleDesignerMetadataAsset] = Field(default_factory=list)
    schemas: list[NoodleDesignerSchema] = Field(default_factory=list)
    transformations: list[NoodleDesignerTransformation] = Field(default_factory=list)
    deployment: NoodleDesignerDeployment = Field(default_factory=NoodleDesignerDeployment)
    orchestrator_plan: NoodleOrchestratorPlan | None = None
    schedule: NoodleDesignerSchedule
    runs: list[NoodleDesignerRun] = Field(default_factory=list)
    saved_at: str


class NoodlePipelineRunCreateRequest(BaseModel):
    trigger: DesignerTrigger = "manual"
    orchestration_mode: DesignerOrchestrationMode = "tasks"
    if_condition: str | None = None
    test_node_id: str | None = None
    document: NoodlePipelineDocument | None = None


class NoodlePipelineRunResponse(BaseModel):
    pipeline: NoodlePipelineDocument
    run: NoodleDesignerRun
