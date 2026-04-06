from __future__ import annotations

from app.noodle.schemas import NoodleMicroserviceSpec, NoodleServiceEndpoint


MICROSERVICE_SPECS: list[NoodleMicroserviceSpec] = [
    NoodleMicroserviceSpec(
        name="noodle-api",
        responsibility="Expose control-plane APIs for planning, discovery, and platform operations.",
        domain="control-plane",
        deployment_pattern="stateless-fastapi",
        apis=[
            NoodleServiceEndpoint(method="GET", path="/noodle/overview", summary="Read platform architecture overview."),
            NoodleServiceEndpoint(method="POST", path="/noodle/pipelines/plan", summary="Generate a pipeline plan from business intent."),
        ],
        dependencies=["noodle-planner", "noodle-workflow-service", "noodle-metadata-service"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-planner",
        responsibility="Turn business intent into connector, processing, and serving plans using AI and templates.",
        domain="ai-orchestration",
        deployment_pattern="stateless-fastapi-plus-llm-gateway",
        apis=[
            NoodleServiceEndpoint(method="POST", path="/noodle/planner/generate", summary="Generate orchestration plan."),
            NoodleServiceEndpoint(method="GET", path="/noodle/planner/templates", summary="List workflow templates."),
        ],
        dependencies=["noodle-schema-service", "noodle-routing-service", "noodle-governance-service"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-workflow-service",
        responsibility="Run long-lived orchestration state machines and coordinate execution-plane workers.",
        domain="workflow",
        deployment_pattern="durable-orchestrator",
        apis=[
            NoodleServiceEndpoint(method="POST", path="/noodle/workflows/start", summary="Start workflow execution."),
            NoodleServiceEndpoint(method="GET", path="/noodle/workflows/{workflow_id}", summary="Get workflow run status."),
        ],
        dependencies=["temporal", "kafka", "noodle-processing-orchestrator"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-schema-service",
        responsibility="Infer schemas, detect drift, and validate contracts before publish.",
        domain="metadata",
        deployment_pattern="stateless-fastapi",
        apis=[
            NoodleServiceEndpoint(method="POST", path="/noodle/schema/infer", summary="Infer source schema from sample records."),
        ],
        dependencies=["schema-registry", "noodle-metadata-service"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-routing-service",
        responsibility="Decide dataset landing zones and serving patterns based on SLA, sensitivity, and consumers.",
        domain="control-plane",
        deployment_pattern="stateless-fastapi",
        apis=[
            NoodleServiceEndpoint(method="POST", path="/noodle/routing/decide", summary="Choose data routing strategy."),
        ],
        dependencies=["noodle-governance-service", "noodle-serving-service"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-connector-registry",
        responsibility="Manage supported connector definitions and onboarding metadata.",
        domain="ingestion",
        deployment_pattern="stateless-fastapi",
        apis=[
            NoodleServiceEndpoint(method="GET", path="/noodle/connectors", summary="List supported connectors."),
            NoodleServiceEndpoint(method="POST", path="/noodle/connectors/register", summary="Register connector metadata."),
        ],
        dependencies=["noodle-ingestion-runtime"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-ingestion-runtime",
        responsibility="Execute batch, CDC, event, SaaS, and edge ingestion jobs into the event backbone.",
        domain="ingestion",
        deployment_pattern="worker-runtime",
        apis=[
            NoodleServiceEndpoint(method="POST", path="/noodle/ingestion/jobs", summary="Start ingestion job."),
        ],
        dependencies=["kafka", "edge-sync", "connector-runtimes"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-processing-orchestrator",
        responsibility="Submit Spark, Flink, dbt, and Python enrichment workloads to the execution plane.",
        domain="processing",
        deployment_pattern="stateless-fastapi",
        apis=[
            NoodleServiceEndpoint(method="POST", path="/noodle/processing/jobs/batch", summary="Submit batch processing job."),
            NoodleServiceEndpoint(method="POST", path="/noodle/processing/jobs/stream", summary="Submit streaming processing job."),
        ],
        dependencies=["spark", "flink", "dbt"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-enrichment-service",
        responsibility="Apply AI enrichment, classification, tagging, and embedding generation.",
        domain="ai-processing",
        deployment_pattern="stateless-fastapi-plus-workers",
        apis=[
            NoodleServiceEndpoint(method="POST", path="/noodle/enrichment/run", summary="Run enrichment tasks for a dataset."),
        ],
        dependencies=["llm-gateway", "embedding-service"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-quality-service",
        responsibility="Score datasets for freshness, completeness, distribution, and contract conformance.",
        domain="quality",
        deployment_pattern="stateless-fastapi-plus-workers",
        apis=[
            NoodleServiceEndpoint(method="POST", path="/noodle/quality/check", summary="Evaluate data quality."),
        ],
        dependencies=["noodle-metadata-service", "great-expectations-or-soda"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-metadata-service",
        responsibility="Register datasets, glossary, ownership, and technical metadata.",
        domain="metadata",
        deployment_pattern="stateless-fastapi",
        apis=[
            NoodleServiceEndpoint(method="GET", path="/noodle/metadata/datasets", summary="List registered datasets."),
        ],
        dependencies=["datahub", "openlineage"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-lineage-service",
        responsibility="Capture and query asset lineage across ingestion, processing, and serving.",
        domain="metadata",
        deployment_pattern="stateless-fastapi",
        apis=[
            NoodleServiceEndpoint(method="GET", path="/noodle/lineage/{asset_id}", summary="Fetch lineage graph for an asset."),
        ],
        dependencies=["openlineage", "metadata-store"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-governance-service",
        responsibility="Evaluate masking, compliance, retention, and residency policies before publish.",
        domain="governance",
        deployment_pattern="stateless-fastapi",
        apis=[
            NoodleServiceEndpoint(method="POST", path="/noodle/governance/evaluate", summary="Evaluate policy controls for a dataset."),
        ],
        dependencies=["policy-engine", "audit-store"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-access-service",
        responsibility="Apply RBAC and ABAC checks to data products and control-plane actions.",
        domain="security",
        deployment_pattern="stateless-fastapi",
        apis=[
            NoodleServiceEndpoint(method="POST", path="/noodle/access/check", summary="Evaluate data access request."),
        ],
        dependencies=["idp", "policy-engine"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-serving-service",
        responsibility="Expose governed data products to APIs, BI, reverse ETL, and feature consumers.",
        domain="serving",
        deployment_pattern="stateless-fastapi",
        apis=[
            NoodleServiceEndpoint(method="GET", path="/noodle/serving/data-products", summary="List published data products."),
        ],
        dependencies=["lakehouse", "semantic-layer", "feature-store"],
    ),
    NoodleMicroserviceSpec(
        name="noodle-observability-service",
        responsibility="Track pipeline health, cost, SLA, and quality metrics.",
        domain="observability",
        deployment_pattern="stateless-fastapi",
        apis=[
            NoodleServiceEndpoint(method="GET", path="/noodle/observability/pipelines/{pipeline_name}", summary="Read observability metrics for a pipeline."),
        ],
        dependencies=["opentelemetry", "prometheus", "cost-attribution-pipeline"],
    ),
]


def get_microservice_specs() -> list[NoodleMicroserviceSpec]:
    return MICROSERVICE_SPECS


def get_microservice_spec(service_name: str) -> NoodleMicroserviceSpec:
    for spec in MICROSERVICE_SPECS:
        if spec.name == service_name:
            return spec
    raise KeyError(service_name)
