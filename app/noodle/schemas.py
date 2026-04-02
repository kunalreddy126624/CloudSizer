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

