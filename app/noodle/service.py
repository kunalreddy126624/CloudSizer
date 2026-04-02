from __future__ import annotations

from functools import lru_cache

from app.noodle.ai.planner import NoodleAiPlannerService
from app.noodle.config import get_noodle_settings
from app.noodle.connectors.registry import build_connector_plans
from app.noodle.governance.policies import GovernancePolicyService
from app.noodle.metadata.catalog import MetadataCatalogService
from app.noodle.observability.metrics import NoodleObservabilityService
from app.noodle.orchestrator.workflow import WorkflowTemplateService
from app.noodle.processing.contracts import build_processing_stages
from app.noodle.sample_specs import REFERENCE_SPECS
from app.noodle.schemas import (
    NoodleArchitectureOverview,
    NoodlePipelineIntent,
    NoodlePipelinePlanResponse,
    NoodlePlatformBlueprint,
    NoodleScalabilityConcern,
    NoodleTechnologyMapping,
    NoodleUseCase,
)
from app.noodle.storage.lakehouse import LakehouseArchitectureService


TEXTUAL_DIAGRAM = """
+----------------------------------------------------------------------------------+
|                                 Serving Layer                                    |
| APIs | BI | Reverse ETL | Feature Serving | Agent Query Endpoints                |
+------------------------------------------+---------------------------------------+
                                           |
                                 Unified Data Layer
                  Lakehouse | Semantic Views | Feature Store | Metadata
                                           |
                                  Processing Layer
                 Spark | Flink | AI Enrichment | Quality Enforcement
                                           |
                   Noodle Orchestrator Core / Control Plane
         AI Planner | Workflow Engine | Schema Intelligence | Auto Routing
                                           |
                                Event Backbone / Bus
                                   Kafka / Pulsar
                                           |
                                   Ingestion Layer
            APIs | DB CDC | Streams | Files | SaaS | IoT | Edge Sync Agents
                                           |
                                    Source Systems
      Hybrid On-Prem | AWS | Azure | GCP | Edge Gateways | SaaS Platforms
+----------------------------------------------------------------------------------+
""".strip()


class NoodleOrchestratorService:
    def __init__(self) -> None:
        settings = get_noodle_settings()
        self.settings = settings
        self.ai = NoodleAiPlannerService(settings)
        self.workflow = WorkflowTemplateService(settings)
        self.governance = GovernancePolicyService()
        self.metadata = MetadataCatalogService(settings)
        self.lakehouse = LakehouseArchitectureService(settings)
        self.observability = NoodleObservabilityService()

    def get_overview(self) -> NoodleArchitectureOverview:
        return NoodleArchitectureOverview(
            name="Noodle Orchestrator",
            objective="Create a unified data orchestration platform across hybrid, multi-cloud, and edge environments.",
            textual_diagram=TEXTUAL_DIAGRAM,
            core_capabilities=[
                "Batch and event-driven ingestion",
                "AI-generated pipelines and schema intelligence",
                "Stream and batch processing with enrichment",
                "Lakehouse-backed source of truth with metadata and lineage",
                "Governed serving for analytics, APIs, and ML",
            ],
            component_breakdown={
                "ingestion": ["connector runtime", "edge sync agents", "event gateway"],
                "orchestration": ["planner", "routing engine", "workflow manager", "policy engine"],
                "processing": ["spark jobs", "flink jobs", "quality workers", "ai enrichment"],
                "unified_data": ["lakehouse", "semantic layer", "feature store", "metadata catalog"],
                "serving": ["fastapi", "bi endpoints", "reverse etl", "feature APIs"],
                "observability": ["otel", "metrics", "quality scorecards", "cost attribution"],
            },
            technology_mapping=[
                NoodleTechnologyMapping(layer="ingestion", primary=["Kafka", "CDC connectors", "FastAPI webhooks"], optional=["Pulsar", "Event Hubs", "Pub/Sub"]),
                NoodleTechnologyMapping(layer="orchestration", primary=[self.settings.workflow_backend, "event-driven control plane"], optional=["Apache Airflow"]),
                NoodleTechnologyMapping(layer="processing", primary=["Spark", "Flink", "dbt"], optional=["Ray", "serverless functions"]),
                NoodleTechnologyMapping(layer="storage", primary=self.lakehouse.stack(), optional=["Delta Lake", "warehouse acceleration"]),
                NoodleTechnologyMapping(layer="metadata", primary=self.metadata.stack(), optional=["Amundsen"]),
                NoodleTechnologyMapping(layer="ai", primary=self.ai.stack(), optional=["model registry", "vector database"]),
            ],
            use_cases=[
                NoodleUseCase(name="Hybrid operations intelligence", summary="Merge edge telemetry, ERP data, and cloud events for near real-time operations insight.", involved_layers=["ingestion", "processing", "serving"]),
                NoodleUseCase(name="Multi-cloud customer 360", summary="Build a trusted customer profile from SaaS, CRM, and product telemetry across cloud boundaries.", involved_layers=["orchestration", "unified_data", "serving"]),
                NoodleUseCase(name="AI-ready lakehouse", summary="Prepare governed datasets and features for LLM copilots and predictive models.", involved_layers=["ai", "processing", "governance"]),
            ],
            scalability=[
                NoodleScalabilityConcern(concern="Cross-environment source growth", strategy="Partition ingestion by domain and source class with event topics per pipeline."),
                NoodleScalabilityConcern(concern="High-concurrency orchestration", strategy="Separate control plane from execution plane and scale workflow workers independently."),
                NoodleScalabilityConcern(concern="Query and serving fan-out", strategy="Use open table formats, semantic views, and materialized serving projections."),
            ],
        )

    def list_reference_specs(self):
        return REFERENCE_SPECS

    def plan_pipeline(self, intent: NoodlePipelineIntent) -> NoodlePipelinePlanResponse:
        return NoodlePipelinePlanResponse(
            intent=intent,
            connectors=build_connector_plans(intent),
            processing_stages=build_processing_stages(intent),
            governance_controls=self.governance.build_controls(intent),
            ai_capabilities=self.ai.capabilities(intent),
            observability=self.observability.capabilities(),
            serving_patterns=[
                "FastAPI data product APIs",
                "Semantic SQL endpoints",
                "BI-ready gold views",
                "Feature serving endpoints" if intent.requires_ml_features else "Warehouse-consumer extracts",
            ],
            workflow_template=self.workflow.choose_template(intent),
        )

    def get_blueprint(self) -> NoodlePlatformBlueprint:
        return NoodlePlatformBlueprint(
            overview=self.get_overview(),
            lakehouse_layout=self.metadata.lakehouse_layout(),
            orchestration_stack=self.workflow.stack(),
            metadata_stack=self.metadata.stack(),
            governance_stack=self.governance.stack(),
            ai_stack=self.ai.stack(),
            observability_stack=self.observability.stack(),
        )


@lru_cache(maxsize=1)
def get_noodle_service() -> NoodleOrchestratorService:
    return NoodleOrchestratorService()

