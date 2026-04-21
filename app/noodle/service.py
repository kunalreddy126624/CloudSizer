from __future__ import annotations

from functools import lru_cache
import re

from app.noodle.ai.planner import NoodleAiPlannerService
from app.noodle.ai.rag import NoodleRagService
from app.noodle.config import get_noodle_settings
from app.noodle.connectors.registry import build_connector_plans
from app.noodle.governance.policies import GovernancePolicyService
from app.noodle.metadata.catalog import MetadataCatalogService
from app.noodle.observability.metrics import NoodleObservabilityService
from app.noodle.orchestrator.workflow import WorkflowTemplateService
from app.noodle.processing.contracts import build_processing_stages
from app.noodle.sample_specs import REFERENCE_SPECS
from app.noodle.schemas import (
    NoodleAgentQueryRequest,
    NoodleAgentQueryResponse,
    NoodleDesignerMomoQueryRequest,
    NoodleDesignerMomoResponse,
    NoodleArchitectureAlignmentItem,
    NoodleArchitecturePrinciple,
    NoodleArchitectureOverview,
    NoodleBuildPhase,
    NoodleExecutionEngineBlueprint,
    NoodleExecutionFlowStep,
    NoodleOrchestratorPlan,
    NoodleOrchestratorTaskPlan,
    NoodlePipelineIntent,
    NoodlePipelineIntentCatalogItem,
    NoodlePipelineIntentCatalogResponse,
    NoodlePipelinePlanningRequest,
    NoodlePipelinePlanResponse,
    NoodlePlatformBlueprint,
    NoodlePlatformPlane,
    NoodleRagQueryRequest,
    NoodleRagQueryResponse,
    NoodleRecommendedStackItem,
    NoodleRepositorySection,
    NoodleScalabilityConcern,
    NoodleTaskState,
    NoodleTechnologyMapping,
    NoodleUseCase,
)
from app.noodle.storage.lakehouse import LakehouseArchitectureService


TEXTUAL_DIAGRAM = """
+----------------------------------------------------------------------------------+
|                              Control Plane                                        |
| UI/API | Pipeline Metadata | Versioning | Schedules | Auth | Lineage Catalog     |
+------------------------------------------+---------------------------------------+
                                           |
                         Portable JSON Pipeline Specifications
                                           |
|                             Execution Plane                                       |
| Workers | Runners | Retries | Plugin Runtime | Logs | Metrics | Lineage Events   |
+------------------------------------------+---------------------------------------+
                                           |
                                  Processing Layer
                 Spark | Flink | Celery Jobs | Quality Enforcement | Serving
                                           |
                                Event Backbone / Bus
                                   Kafka / Redis
                                           |
                                   Plugin Layer
          Source Plugins | Transform Plugins | Sink Plugins | Connection Refs
                                           |
                                    Source Systems
      Hybrid On-Prem | AWS | Azure | GCP | Edge Gateways | SaaS Platforms
+----------------------------------------------------------------------------------+
""".strip()


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return normalized or "task"


class NoodleOrchestratorService:
    def __init__(self) -> None:
        settings = get_noodle_settings()
        self.settings = settings
        self.ai = NoodleAiPlannerService(settings)
        self.rag = NoodleRagService(settings)
        self.workflow = WorkflowTemplateService(settings)
        self.governance = GovernancePolicyService()
        self.metadata = MetadataCatalogService(settings)
        self.lakehouse = LakehouseArchitectureService(settings)
        self.observability = NoodleObservabilityService()

    def get_overview(self) -> NoodleArchitectureOverview:
        return NoodleArchitectureOverview(
            name="Noodle Orchestrator",
            objective="Create a JSON-based, plugin-oriented data orchestration platform with a scalable control plane and execution plane split.",
            textual_diagram=TEXTUAL_DIAGRAM,
            core_capabilities=[
                "Portable JSON pipeline specifications instead of hardcoded-only Python flows",
                "Separate control plane for UI, API, metadata, versioning, and scheduling",
                "Independent execution plane for workers, runners, retries, and plugin execution",
                "Plugin-first connectors, transforms, and sinks without special cases",
                "First-class logs, metrics, and lineage for operational observability",
            ],
            component_breakdown={
                "control_plane": ["pipeline builder ui", "pipeline api", "metadata catalog", "version registry", "scheduler api"],
                "execution_plane": ["worker manager", "task runners", "retry engine", "plugin runtime", "manual run dispatch"],
                "plugins": ["source plugins", "transform plugins", "sink plugins", "connection reference adapters"],
                "observability": ["structured logs", "metrics", "run status", "lineage graph", "alerts"],
                "platform_data": ["postgresql", "redis", "s3 or minio", "pipeline specs", "connection refs"],
            },
            technology_mapping=[
                NoodleTechnologyMapping(layer="frontend", primary=["React", "TypeScript", "Tailwind", "React Flow"], optional=["Next.js app router"]),
                NoodleTechnologyMapping(layer="backend", primary=["FastAPI", "SQLAlchemy", "Pydantic"], optional=["service modules", "repository layer"]),
                NoodleTechnologyMapping(layer="jobs", primary=["Celery", "Redis", "Apache Airflow"], optional=["manual runners", "future Kubernetes workers"]),
                NoodleTechnologyMapping(layer="storage", primary=["PostgreSQL", "S3 or MinIO"], optional=self.lakehouse.stack()),
                NoodleTechnologyMapping(layer="auth_and_monitoring", primary=["JWT or Clerk", "Prometheus", "Grafana"], optional=["OpenTelemetry"]),
                NoodleTechnologyMapping(layer="deployment", primary=["Docker"], optional=["Kubernetes later"]),
            ],
            use_cases=[
                NoodleUseCase(name="Hybrid operations intelligence", summary="Merge edge telemetry, ERP data, and cloud events with a portable DAG spec that can run across environments.", involved_layers=["plugins", "execution_plane", "observability"]),
                NoodleUseCase(name="Multi-cloud customer 360", summary="Build a governed customer profile with versioned pipelines, connection refs, and a plugin-based connector registry.", involved_layers=["control_plane", "platform_data", "plugins"]),
                NoodleUseCase(name="AI-ready lakehouse", summary="Create curated datasets and features while keeping logs, lineage, and execution state visible in the platform.", involved_layers=["execution_plane", "observability", "platform_data"]),
            ],
            scalability=[
                NoodleScalabilityConcern(concern="Cross-environment source growth", strategy="Onboard every source and sink through plugins so new integrations do not add special-case orchestration code."),
                NoodleScalabilityConcern(concern="High-concurrency orchestration", strategy="Separate control plane from execution plane and scale workers and runners independently."),
                NoodleScalabilityConcern(concern="Operational complexity", strategy="Version pipelines, task configs, schedules, and connection refs so rollbacks and audits stay manageable."),
            ],
        )

    def list_reference_specs(self):
        return REFERENCE_SPECS

    def list_pipeline_intents(self) -> NoodlePipelineIntentCatalogResponse:
        return NoodlePipelineIntentCatalogResponse(
            items=[
                NoodlePipelineIntentCatalogItem(
                    id=spec.id,
                    name=spec.name,
                    summary=spec.summary,
                    tags=spec.tags,
                    intent=spec.sample_intent,
                    recommended_workflow_template=self.workflow.choose_template(spec.sample_intent),
                )
                for spec in REFERENCE_SPECS
            ]
        )

    def _workflow_template_for_request(self, request: NoodlePipelinePlanningRequest) -> str:
        template = self.workflow.choose_template(request.intent)
        architecture = request.architecture_context
        if architecture is None:
            return template

        summary_text = " ".join(
            [
                architecture.prompt,
                architecture.summary,
                architecture.system_design,
                " ".join(architecture.data_flow),
                " ".join(architecture.components),
            ]
        ).lower()
        if any(keyword in summary_text for keyword in ["event", "stream", "real-time", "realtime", "kafka"]):
            return f"{self.settings.workflow_backend}-event-driven-realtime"
        if any(keyword in summary_text for keyword in ["feature", "ml", "inference", "serving"]):
            return f"{self.settings.workflow_backend}-batch-plus-feature-materialization"
        return template

    def _build_architecture_alignment(
        self,
        request: NoodlePipelinePlanningRequest,
        workflow_template: str,
        practice_principles: list[NoodleArchitecturePrinciple],
    ) -> list[NoodleArchitectureAlignmentItem]:
        alignment: list[NoodleArchitectureAlignmentItem] = []
        architecture = request.architecture_context

        alignment.append(
            NoodleArchitectureAlignmentItem(
                area="Portable pipeline spec",
                guidance="Use the JSON pipeline document as the source of truth for validation, publishing, scheduling, and execution handoff.",
            )
        )
        alignment.append(
            NoodleArchitectureAlignmentItem(
                area="Control and execution planes",
                guidance=f"Keep orchestration APIs, metadata, and scheduling in the control plane while {workflow_template} runs in the execution plane.",
            )
        )

        if architecture is not None:
            provider_text = ", ".join(architecture.selected_providers) if architecture.selected_providers else "the saved cloud and runtime stack"
            alignment.append(
                NoodleArchitectureAlignmentItem(
                    area="Saved architecture fit",
                    guidance=f'Anchor the pipeline to the saved architecture "{architecture.name}" and align plugins, storage, and execution contracts with {provider_text}.',
                )
            )
            if architecture.data_flow:
                alignment.append(
                    NoodleArchitectureAlignmentItem(
                        area="Data flow",
                        guidance=f"Model the DAG around the saved architecture flow: {' -> '.join(architecture.data_flow[:4])}.",
                    )
                )
            if architecture.security_considerations:
                alignment.append(
                    NoodleArchitectureAlignmentItem(
                        area="Security and governance",
                        guidance=f"Carry these architecture controls into the pipeline plan: {', '.join(architecture.security_considerations[:3])}.",
                    )
                )

        if practice_principles:
            alignment.extend(
                NoodleArchitectureAlignmentItem(area=principle.title, guidance=principle.directive)
                for principle in practice_principles
            )

        return alignment

    def _build_agent_momo_brief(
        self,
        request: NoodlePipelinePlanningRequest,
        workflow_template: str,
        practice_principles: list[NoodleArchitecturePrinciple],
        architecture_alignment: list[NoodleArchitectureAlignmentItem],
    ) -> str:
        architecture = request.architecture_context
        architecture_text = (
            f'Use saved architecture "{architecture.name}" as the design anchor.'
            if architecture
            else "Use the default Noodle control-plane architecture as the design anchor."
        )
        principle_text = ", ".join(principle.title for principle in practice_principles[:5]) or "portable JSON specs, plugins, versioning, and observability"
        alignment_text = " | ".join(item.guidance for item in architecture_alignment[:4])
        system_design_text = (
            f" System design anchor: {architecture.system_design[:300]}."
            if architecture and architecture.system_design
            else ""
        )
        return (
            f"{architecture_text} "
            f"Apply these practice principles: {principle_text}. "
            f"Guide the user toward plugin-backed nodes, versioned configs and schedules, control-plane metadata ownership, and execution-plane worker orchestration. "
            f"Current workflow template recommendation: {workflow_template}. "
            f"Architecture alignment: {alignment_text}"
            f"{system_design_text}"
        )

    def _build_orchestrator_plan(
        self,
        request: NoodlePipelinePlanningRequest,
        workflow_template: str,
        connectors,
        processing_stages,
    ) -> NoodleOrchestratorPlan:
        tasks: list[NoodleOrchestratorTaskPlan] = []
        previous_task_ids: list[str] = []

        for connector in connectors:
            task_id = f"task-{_slugify(connector.source_name)}-ingest"
            tasks.append(
                NoodleOrchestratorTaskPlan(
                    id=task_id,
                    name=f"Ingest {connector.source_name}",
                    stage="ingestion",
                    plugin=connector.connector_type,
                    execution_plane="airflow" if connector.ingestion_mode in {"batch", "micro_batch"} else "worker",
                    depends_on=[],
                    outputs=[connector.landing_zone],
                    notes=f"Land {connector.source_name} into {connector.landing_zone} using {connector.connector_type}.",
                )
            )
            previous_task_ids.append(task_id)

        for stage in processing_stages:
            task_id = f"task-{_slugify(stage.name)}"
            execution_plane = "quality" if stage.name == "quality_and_contract_enforcement" else "worker"
            if "serve" in stage.name:
                execution_plane = "serving"
            tasks.append(
                NoodleOrchestratorTaskPlan(
                    id=task_id,
                    name=stage.name.replace("_", " ").title(),
                    stage=stage.name,
                    plugin=stage.engine,
                    execution_plane=execution_plane,
                    depends_on=list(previous_task_ids),
                    outputs=list(stage.outputs),
                    notes=stage.purpose,
                )
            )
            previous_task_ids = [task_id]

        notes = [
            "Keep schedules, metadata, connection references, and versioning in the control plane.",
            f"Hand the published JSON pipeline spec to {workflow_template} for DAG execution.",
            "Treat logs, metrics, and lineage as required outputs of every run.",
        ]
        if request.architecture_context is not None:
            notes.append(f'Align task execution and storage contracts with saved architecture "{request.architecture_context.name}".')

        return NoodleOrchestratorPlan(
            id=f"plan-{_slugify(request.intent.name)}",
            name=f"{request.intent.name} orchestrator plan",
            objective=request.intent.business_goal,
            trigger="manual",
            execution_target=workflow_template,
            tasks=tasks,
            notes=notes,
        )

    def plan_pipeline(self, request: NoodlePipelinePlanningRequest) -> NoodlePipelinePlanResponse:
        practice_principles = request.practice_principles or self.get_blueprint().design_principles
        workflow_template = self._workflow_template_for_request(request)
        architecture_alignment = self._build_architecture_alignment(request, workflow_template, practice_principles)
        connectors = build_connector_plans(request.intent)
        processing_stages = build_processing_stages(request.intent)
        return NoodlePipelinePlanResponse(
            intent=request.intent,
            connectors=connectors,
            processing_stages=processing_stages,
            governance_controls=self.governance.build_controls(request.intent),
            ai_capabilities=self.ai.capabilities(request.intent),
            observability=self.observability.capabilities(),
            serving_patterns=[
                "FastAPI data product APIs",
                "Semantic SQL endpoints",
                "BI-ready gold views",
                "Feature serving endpoints" if request.intent.requires_ml_features else "Warehouse-consumer extracts",
            ],
            workflow_template=workflow_template,
            architecture_context_name=request.architecture_context.name if request.architecture_context else None,
            practice_principles_applied=[principle.title for principle in practice_principles],
            architecture_alignment=architecture_alignment,
            agent_momo_brief=self._build_agent_momo_brief(
                request,
                workflow_template,
                practice_principles,
                architecture_alignment,
            ),
            orchestrator_plan=self._build_orchestrator_plan(
                request,
                workflow_template,
                connectors,
                processing_stages,
            ),
        )

    def query_knowledge(self, request: NoodleRagQueryRequest) -> NoodleRagQueryResponse:
        return self.rag.query(request)

    def query_agent(self, request: NoodleAgentQueryRequest) -> NoodleAgentQueryResponse:
        response = self.rag.query_agent(request)

        if request.agent == "momo" and request.intent is not None:
            planning_request = NoodlePipelinePlanningRequest(
                intent=request.intent,
                architecture_context=request.architecture_context,
            )
            workflow_template = self._workflow_template_for_request(planning_request)
            practice_principles = self.get_blueprint().design_principles
            architecture_alignment = self._build_architecture_alignment(
                planning_request,
                workflow_template,
                practice_principles,
            )
            brief = self._build_agent_momo_brief(
                planning_request,
                workflow_template,
                practice_principles,
                architecture_alignment,
            )
            answer = f"{brief} {response.answer}".strip()
            return response.model_copy(update={"brief": brief, "answer": answer})

        if request.agent == "architect" and request.architecture_context is not None:
            system_design = request.architecture_context.system_design
            if system_design:
                answer = f"System design anchor: {system_design[:320]}. {response.answer}".strip()
                return response.model_copy(update={"answer": answer})

        return response

    def query_designer_momo(self, request: NoodleDesignerMomoQueryRequest) -> NoodleDesignerMomoResponse:
        agent_response = self.query_agent(
            NoodleAgentQueryRequest(
                agent="momo",
                user_turn=request.user_turn,
                max_results=request.max_results,
                architecture_context=request.architecture_context,
                pipeline_document=request.pipeline_document,
                intent=request.intent,
            )
        )
        return NoodleDesignerMomoResponse(
            answer=agent_response.answer,
            brief=agent_response.brief,
            sources=agent_response.sources,
            retrieval_backend=agent_response.retrieval_backend,
            recovered=agent_response.recovered,
            recovery_strategy=agent_response.recovery_strategy,
            attempted_queries=agent_response.attempted_queries,
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
            design_principles=[
                NoodleArchitecturePrinciple(
                    title="Use JSON-based pipelines",
                    directive="Store a portable pipeline spec instead of treating Python code as the only pipeline definition format.",
                    rationale="JSON specs make pipelines portable across UI, API, validation, scheduling, and execution services.",
                ),
                NoodleArchitecturePrinciple(
                    title="Separate control plane from execution plane",
                    directive="Keep UI, API, metadata, and scheduling in the control plane while workers and runners stay in the execution plane.",
                    rationale="This keeps the platform scalable and lets runtime capacity grow independently from user-facing control services.",
                ),
                NoodleArchitecturePrinciple(
                    title="Use plugins, not special cases",
                    directive="Model every source, sink, and transform as a plugin contract.",
                    rationale="Plugin contracts keep integrations uniform and avoid brittle orchestration branches for individual connectors.",
                ),
                NoodleArchitecturePrinciple(
                    title="Version everything",
                    directive="Version pipelines, task configs, schedules, and connection references.",
                    rationale="Versioning makes rollbacks, auditability, promotion flows, and safe iteration practical.",
                ),
                NoodleArchitecturePrinciple(
                    title="Treat logs and lineage as first-class",
                    directive="Design observability into the platform rather than bolting it on after execution works.",
                    rationale="Users need visibility into runs, failures, freshness, and lineage as much as they need execution itself.",
                ),
            ],
            platform_planes=[
                NoodlePlatformPlane(
                    name="Control plane",
                    responsibility="Own the product surface, metadata, pipeline definitions, versioning, and orchestration APIs.",
                    components=["UI", "API", "metadata", "pipeline registry", "schedules", "auth"],
                ),
                NoodlePlatformPlane(
                    name="Execution plane",
                    responsibility="Run pipeline tasks, retries, plugins, and worker processes independently from the control plane.",
                    components=["workers", "runners", "Celery jobs", "Airflow DAGs", "retry engine", "lineage emitters"],
                ),
            ],
            repository_layout=[
                NoodleRepositorySection(
                    root="/backend/app",
                    paths=[
                        "api",
                        "core",
                        "models",
                        "schemas",
                        "services",
                        "workers",
                        "plugins",
                        "orchestrators",
                        "repositories",
                    ],
                ),
                NoodleRepositorySection(
                    root="/frontend/src",
                    paths=[
                        "components",
                        "pages",
                        "features/pipeline-builder",
                        "features/pipeline-runs",
                        "features/connections",
                        "features/auth",
                        "lib",
                    ],
                ),
            ],
            recommended_stack=[
                NoodleRecommendedStackItem(layer="Frontend", technologies=["React", "TypeScript", "Tailwind", "React Flow"]),
                NoodleRecommendedStackItem(layer="Backend", technologies=["FastAPI", "SQLAlchemy", "Pydantic"]),
                NoodleRecommendedStackItem(layer="DB", technologies=["PostgreSQL"]),
                NoodleRecommendedStackItem(layer="Async jobs", technologies=["Celery", "Redis"]),
                NoodleRecommendedStackItem(layer="Orchestration", technologies=["Apache Airflow"]),
                NoodleRecommendedStackItem(layer="Infra", technologies=["Docker", "Kubernetes later"]),
                NoodleRecommendedStackItem(layer="Storage", technologies=["S3", "MinIO"]),
                NoodleRecommendedStackItem(layer="Auth", technologies=["JWT", "Clerk"]),
                NoodleRecommendedStackItem(layer="Monitoring", technologies=["Prometheus", "Grafana"]),
            ],
            build_phases=[
                NoodleBuildPhase(phase="Phase 1", outcomes=["auth", "pipeline CRUD", "DAG designer", "manual run", "run status page"]),
                NoodleBuildPhase(phase="Phase 2", outcomes=["scheduler", "retries", "alerts", "secrets", "connector registry"]),
                NoodleBuildPhase(phase="Phase 3", outcomes=["lineage", "role-based access", "multi-tenancy", "autoscaling workers", "cost tracking"]),
            ],
            execution_engine=NoodleExecutionEngineBlueprint(
                summary="The execution engine converts a published DAG into Apache Airflow-runnable jobs, enforces dependency ordering, and persists task-level status, logs, artifacts, metrics, and lineage signals.",
                flow=[
                    NoodleExecutionFlowStep(step="User publishes pipeline", description="A validated pipeline version becomes eligible for scheduling and execution."),
                    NoodleExecutionFlowStep(step="Backend validates DAG", description="The control plane checks acyclic dependencies, plugin compatibility, and versioned configuration references."),
                    NoodleExecutionFlowStep(step="Scheduler creates a run", description="A manual or scheduled trigger creates an Airflow DAG run record with version and execution metadata."),
                    NoodleExecutionFlowStep(step="Tasks are submitted to workers", description="The Airflow scheduler dispatches runnable tasks to execution-plane workers and runners."),
                    NoodleExecutionFlowStep(step="Each task updates status", description="Workers report state transitions back to the control plane as execution progresses."),
                    NoodleExecutionFlowStep(step="Logs, artifacts, and metrics are stored", description="Task output and observability data are persisted for debugging, auditing, and downstream analysis."),
                    NoodleExecutionFlowStep(step="Downstream tasks wait for upstream success", description="Tasks only become runnable after all required upstream dependencies finish successfully."),
                ],
                task_states=[
                    NoodleTaskState(name="pending", description="Task exists in the run graph but is not yet eligible for dispatch."),
                    NoodleTaskState(name="queued", description="Task is ready and has been submitted to the worker queue."),
                    NoodleTaskState(name="running", description="Task execution is currently in progress on a worker."),
                    NoodleTaskState(name="success", description="Task completed successfully and downstream dependencies may proceed."),
                    NoodleTaskState(name="failed", description="Task execution ended in an unrecoverable failure for the current attempt."),
                    NoodleTaskState(name="retrying", description="Task failed but is being rescheduled under retry policy."),
                    NoodleTaskState(name="skipped", description="Task was intentionally bypassed because conditions or upstream outcomes did not require execution."),
                    NoodleTaskState(name="cancelled", description="Task execution was stopped before completion by user action or run termination."),
                ],
            ),
        )


@lru_cache(maxsize=1)
def get_noodle_service() -> NoodleOrchestratorService:
    return NoodleOrchestratorService()
