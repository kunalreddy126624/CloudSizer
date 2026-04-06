from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.noodle.connectors.registry import CONNECTOR_BY_SOURCE_KIND
from app.noodle.microservices.registry import get_microservice_spec, get_microservice_specs
from app.noodle.sample_specs import REFERENCE_SPECS
from app.noodle.schemas import (
    NoodleAccessCheckRequest,
    NoodleAccessCheckResponse,
    NoodleConnectorRegistrationRequest,
    NoodleConnectorRegistrationResponse,
    NoodleDataProduct,
    NoodleDatasetSummary,
    NoodleEnrichmentRequest,
    NoodleEnrichmentResponse,
    NoodleJobSubmissionRequest,
    NoodleJobSubmissionResponse,
    NoodleLineageResponse,
    NoodleMicroserviceCatalogResponse,
    NoodleMicroserviceDetailResponse,
    NoodlePipelineIntent,
    NoodlePipelinePlanningRequest,
    NoodlePipelineObservability,
    NoodlePipelinePlanResponse,
    NoodlePolicyEvaluationRequest,
    NoodlePolicyEvaluationResponse,
    NoodleQualityCheckRequest,
    NoodleQualityCheckResponse,
    NoodleRoutingDecisionResponse,
    NoodleRoutingRequest,
    NoodleSchemaField,
    NoodleSchemaInferenceRequest,
    NoodleSchemaInferenceResponse,
    NoodleWorkflowRunStatus,
    NoodleWorkflowStartRequest,
)
from app.noodle.service import get_noodle_service


router = APIRouter(tags=["noodle-microservices"])


def _infer_type(value: object) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    if value is None:
        return "unknown"
    return "string"


@router.get("/microservices", response_model=NoodleMicroserviceCatalogResponse)
def list_microservices() -> NoodleMicroserviceCatalogResponse:
    return NoodleMicroserviceCatalogResponse(services=get_microservice_specs())


@router.get("/microservices/{service_name}", response_model=NoodleMicroserviceDetailResponse)
def get_microservice(service_name: str) -> NoodleMicroserviceDetailResponse:
    try:
        return NoodleMicroserviceDetailResponse(service=get_microservice_spec(service_name))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Noodle microservice not found.") from exc


@router.post("/planner/generate", response_model=NoodlePipelinePlanResponse)
def planner_generate(intent: NoodlePipelineIntent) -> NoodlePipelinePlanResponse:
    return get_noodle_service().plan_pipeline(NoodlePipelinePlanningRequest(intent=intent))


@router.get("/planner/templates", response_model=list[str])
def planner_templates() -> list[str]:
    return [
        "temporal-standard-batch-orchestration",
        "temporal-hybrid-streaming",
        "temporal-event-driven-realtime",
        "temporal-batch-plus-feature-materialization",
    ]


@router.post("/workflows/start", response_model=NoodleWorkflowRunStatus)
def workflow_start(request: NoodleWorkflowStartRequest) -> NoodleWorkflowRunStatus:
    return NoodleWorkflowRunStatus(
        workflow_id=f"wf-{request.pipeline_name}-{request.trigger}",
        service="noodle-workflow-service",
        status="accepted",
        detail=f"Workflow {request.workflow_template} accepted for {request.pipeline_name}.",
    )


@router.get("/workflows/{workflow_id}", response_model=NoodleWorkflowRunStatus)
def workflow_status(workflow_id: str) -> NoodleWorkflowRunStatus:
    return NoodleWorkflowRunStatus(
        workflow_id=workflow_id,
        service="noodle-workflow-service",
        status="running",
        detail="Workflow is executing on the durable orchestration plane.",
    )


@router.post("/schema/infer", response_model=NoodleSchemaInferenceResponse)
def schema_infer(request: NoodleSchemaInferenceRequest) -> NoodleSchemaInferenceResponse:
    fields = [
        NoodleSchemaField(name=name, inferred_type=_infer_type(value), nullable=value is None)
        for name, value in request.sample_record.items()
    ]
    drift_risk = "high" if request.format_hint.lower().startswith("json") else "medium" if fields else "low"
    return NoodleSchemaInferenceResponse(source_name=request.source_name, fields=fields, drift_risk=drift_risk)


@router.post("/routing/decide", response_model=NoodleRoutingDecisionResponse)
def routing_decide(request: NoodleRoutingRequest) -> NoodleRoutingDecisionResponse:
    route_to = ["bronze", "silver", "gold"]
    rationale = ["Standard lakehouse promotion path selected."]
    if request.requires_realtime_serving:
        route_to.append("serving")
        rationale.append("Real-time serving requested, so serving projection is enabled.")
    if "model" in " ".join(request.consumers):
        route_to.append("feature_store")
        rationale.append("Model consumers detected, so feature store publishing is enabled.")
    if request.contains_sensitive_data:
        rationale.append("Sensitive data requires governed publish and masking enforcement.")
    return NoodleRoutingDecisionResponse(dataset_name=request.dataset_name, route_to=route_to, rationale=rationale)


@router.get("/connectors", response_model=list[dict[str, str]])
def list_connectors() -> list[dict[str, str]]:
    return [
        {"source_kind": source_kind, "connector_type": connector_type, "default_mode": mode}
        for source_kind, (connector_type, mode) in CONNECTOR_BY_SOURCE_KIND.items()
    ]


@router.post("/connectors/register", response_model=NoodleConnectorRegistrationResponse)
def register_connector(request: NoodleConnectorRegistrationRequest) -> NoodleConnectorRegistrationResponse:
    return NoodleConnectorRegistrationResponse(status="registered", connector_name=request.name, runtime=request.runtime)


@router.post("/ingestion/jobs", response_model=NoodleJobSubmissionResponse)
def start_ingestion_job(request: NoodleJobSubmissionRequest) -> NoodleJobSubmissionResponse:
    return NoodleJobSubmissionResponse(
        status="accepted",
        job_id=f"ingest-{request.pipeline_name}-{request.stage_name}",
        execution_plane="connector-runtime",
        detail="Ingestion job has been submitted to the event-driven connector runtime.",
    )


@router.post("/processing/jobs/batch", response_model=NoodleJobSubmissionResponse)
def submit_batch_job(request: NoodleJobSubmissionRequest) -> NoodleJobSubmissionResponse:
    return NoodleJobSubmissionResponse(
        status="accepted",
        job_id=f"batch-{request.pipeline_name}-{request.stage_name}",
        execution_plane="spark",
        detail="Batch job submitted to Spark execution plane.",
    )


@router.post("/processing/jobs/stream", response_model=NoodleJobSubmissionResponse)
def submit_stream_job(request: NoodleJobSubmissionRequest) -> NoodleJobSubmissionResponse:
    return NoodleJobSubmissionResponse(
        status="accepted",
        job_id=f"stream-{request.pipeline_name}-{request.stage_name}",
        execution_plane="flink",
        detail="Streaming job submitted to Flink execution plane.",
    )


@router.post("/enrichment/run", response_model=NoodleEnrichmentResponse)
def enrichment_run(request: NoodleEnrichmentRequest) -> NoodleEnrichmentResponse:
    return NoodleEnrichmentResponse(
        dataset_name=request.dataset_name,
        tasks=request.tasks or ["classification", "semantic-tagging", "embedding-generation"],
        execution_mode="async",
    )


@router.post("/quality/check", response_model=NoodleQualityCheckResponse)
def quality_check(request: NoodleQualityCheckRequest) -> NoodleQualityCheckResponse:
    checks = request.checks or ["freshness", "completeness", "distribution", "contract"]
    return NoodleQualityCheckResponse(
        dataset_name=request.dataset_name,
        score=97.5,
        passed_checks=checks[:-1] if len(checks) > 1 else checks,
        failed_checks=[] if len(checks) <= 1 else [checks[-1]],
    )


@router.get("/metadata/datasets", response_model=list[NoodleDatasetSummary])
def metadata_datasets() -> list[NoodleDatasetSummary]:
    return [
        NoodleDatasetSummary(
            dataset_name=spec.sample_intent.name,
            zone="gold" if spec.sample_intent.requires_realtime_serving else "silver",
            owner="domain-data-platform",
            classification="restricted" if spec.sample_intent.contains_sensitive_data else "internal",
        )
        for spec in REFERENCE_SPECS
    ]


@router.get("/lineage/{asset_id}", response_model=NoodleLineageResponse)
def lineage_asset(asset_id: str) -> NoodleLineageResponse:
    return NoodleLineageResponse(
        asset_id=asset_id,
        upstream_assets=[f"{asset_id}.bronze", f"{asset_id}.silver"],
        downstream_assets=[f"{asset_id}.gold", f"{asset_id}.serving"],
    )


@router.post("/governance/evaluate", response_model=NoodlePolicyEvaluationResponse)
def governance_evaluate(request: NoodlePolicyEvaluationRequest) -> NoodlePolicyEvaluationResponse:
    controls = ["rbac-abac-enforcement", "lineage-backed-quality-gates"]
    if request.contains_sensitive_data:
        controls.extend(["dynamic-data-masking", "residency-and-compliance-routing"])
    return NoodlePolicyEvaluationResponse(asset_name=request.asset_name, passed=True, enforced_controls=controls)


@router.post("/access/check", response_model=NoodleAccessCheckResponse)
def access_check(request: NoodleAccessCheckRequest) -> NoodleAccessCheckResponse:
    allowed = request.action == "read"
    return NoodleAccessCheckResponse(
        principal=request.principal,
        asset_name=request.asset_name,
        action=request.action,
        allowed=allowed,
        reason="Read access allowed by default scaffold policy." if allowed else "Write/admin requests require explicit policy grants.",
    )


@router.get("/serving/data-products", response_model=list[NoodleDataProduct])
def serving_data_products() -> list[NoodleDataProduct]:
    return [
        NoodleDataProduct(name="operations_intelligence_api", interface="fastapi", consumers=["operations", "bi"]),
        NoodleDataProduct(name="customer_360_gold_view", interface="sql", consumers=["bi", "agents"]),
        NoodleDataProduct(name="anomaly_features", interface="feature_api", consumers=["ml"]),
    ]


@router.get("/observability/pipelines/{pipeline_name}", response_model=NoodlePipelineObservability)
def observability_pipeline(pipeline_name: str) -> NoodlePipelineObservability:
    return NoodlePipelineObservability(
        pipeline_name=pipeline_name,
        freshness_minutes=5,
        error_rate_percent=0.2,
        monthly_cost_usd=1280.0,
        quality_score=98.1,
    )
