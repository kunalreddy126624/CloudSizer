from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.noodle.microservices.api import router as microservices_router
from app.noodle.pipeline_service import get_noodle_pipeline_control_plane
from app.noodle.schemas import (
    NoodleArchitectureOverview,
    NoodlePipelineDocument,
    NoodlePipelineIntent,
    NoodlePipelinePlanningRequest,
    NoodlePipelinePlanResponse,
    NoodlePlatformBlueprint,
    NoodlePipelineRunCreateRequest,
    NoodlePipelineRunResponse,
    NoodleReferenceSpec,
)
from app.noodle.service import get_noodle_service


router = APIRouter(prefix="/noodle", tags=["noodle"])


@router.get("/overview", response_model=NoodleArchitectureOverview)
def noodle_overview() -> NoodleArchitectureOverview:
    return get_noodle_service().get_overview()


@router.get("/blueprint", response_model=NoodlePlatformBlueprint)
def noodle_blueprint() -> NoodlePlatformBlueprint:
    return get_noodle_service().get_blueprint()


@router.get("/reference-specs", response_model=list[NoodleReferenceSpec])
def noodle_reference_specs() -> list[NoodleReferenceSpec]:
    return get_noodle_service().list_reference_specs()


@router.post("/pipelines/plan", response_model=NoodlePipelinePlanResponse)
def noodle_plan_pipeline(request: NoodlePipelinePlanningRequest) -> NoodlePipelinePlanResponse:
    return get_noodle_service().plan_pipeline(request)


@router.get("/pipelines", response_model=list[NoodlePipelineDocument])
def noodle_list_pipelines() -> list[NoodlePipelineDocument]:
    return get_noodle_pipeline_control_plane().list_pipelines()


@router.get("/pipelines/{pipeline_id}", response_model=NoodlePipelineDocument)
def noodle_get_pipeline(pipeline_id: str) -> NoodlePipelineDocument:
    pipeline = get_noodle_pipeline_control_plane().get_pipeline(pipeline_id)
    if pipeline is None:
      raise HTTPException(status_code=404, detail="Pipeline not found.")
    return pipeline


@router.post("/pipelines", response_model=NoodlePipelineDocument)
def noodle_save_pipeline(document: NoodlePipelineDocument) -> NoodlePipelineDocument:
    return get_noodle_pipeline_control_plane().save_pipeline(document)


@router.post("/pipelines/{pipeline_id}/runs", response_model=NoodlePipelineRunResponse)
def noodle_create_pipeline_run(
    pipeline_id: str,
    request: NoodlePipelineRunCreateRequest,
) -> NoodlePipelineRunResponse:
    try:
        return get_noodle_pipeline_control_plane().create_run(pipeline_id, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Pipeline not found.") from exc


router.include_router(microservices_router)
