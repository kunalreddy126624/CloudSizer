from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.noodle.microservices.api import router as microservices_router
from app.noodle.pipeline_service import get_noodle_pipeline_control_plane
from app.noodle.schemas import (
    NoodleArchitectureOverview,
    NoodlePipelineDocument,
    NoodlePipelineBatchResumeRequest,
    NoodlePipelineBatchResumeResponse,
    NoodlePipelineIntent,
    NoodlePipelinePlanningRequest,
    NoodlePipelinePlanResponse,
    NoodlePipelineRepairRunRequest,
    NoodlePipelineRunCreateRequest,
    NoodlePipelineRunResponse,
    NoodlePlatformBlueprint,
    NoodleReferenceSpec,
)
from app.noodle.service import get_noodle_service


router = APIRouter(prefix="/noodle", tags=["noodle"])


def _raise_noodle_control_plane_error(exc: Exception) -> None:
    message = str(exc)
    if "password authentication failed" in message:
        detail = (
            "Noodle control plane could not connect to PostgreSQL: password authentication failed. "
            "Check NOODLE_DATABASE_URL, DATABASE_URL, ALLOCATOR_DATABASE_URL, or RBAC_DATABASE_URL "
            "and verify the configured PostgreSQL username/password."
        )
        raise HTTPException(status_code=503, detail=detail) from exc
    if "Could not connect to PostgreSQL Noodle persistence" in message:
        detail = (
            "Noodle control plane could not connect to PostgreSQL. "
            f"{message}"
        )
        raise HTTPException(status_code=503, detail=detail) from exc
    if "psycopg is required for PostgreSQL Noodle persistence" in message:
        raise HTTPException(
            status_code=503,
            detail="Noodle control plane requires the psycopg package for PostgreSQL persistence.",
        ) from exc
    raise HTTPException(status_code=500, detail=f"Noodle control plane request failed. {message}") from exc


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
def noodle_plan_pipeline(
    request: NoodlePipelinePlanningRequest | NoodlePipelineIntent,
) -> NoodlePipelinePlanResponse:
    planning_request = (
        request
        if isinstance(request, NoodlePipelinePlanningRequest)
        else NoodlePipelinePlanningRequest(intent=request)
    )
    return get_noodle_service().plan_pipeline(planning_request)


@router.get("/pipelines", response_model=list[NoodlePipelineDocument])
def noodle_list_pipelines() -> list[NoodlePipelineDocument]:
    try:
        return get_noodle_pipeline_control_plane().list_pipelines()
    except RuntimeError as exc:
        _raise_noodle_control_plane_error(exc)


@router.get("/pipelines/{pipeline_id}", response_model=NoodlePipelineDocument)
def noodle_get_pipeline(pipeline_id: str) -> NoodlePipelineDocument:
    try:
        pipeline = get_noodle_pipeline_control_plane().get_pipeline(pipeline_id)
    except RuntimeError as exc:
        _raise_noodle_control_plane_error(exc)
    if pipeline is None:
        raise HTTPException(status_code=404, detail="Pipeline not found.")
    return pipeline


@router.post("/pipelines", response_model=NoodlePipelineDocument)
def noodle_save_pipeline(document: NoodlePipelineDocument) -> NoodlePipelineDocument:
    try:
        return get_noodle_pipeline_control_plane().save_pipeline(document)
    except RuntimeError as exc:
        _raise_noodle_control_plane_error(exc)


@router.post("/pipelines/{pipeline_id}/runs", response_model=NoodlePipelineRunResponse)
def noodle_create_pipeline_run(
    pipeline_id: str,
    request: NoodlePipelineRunCreateRequest,
) -> NoodlePipelineRunResponse:
    try:
        return get_noodle_pipeline_control_plane().create_run(pipeline_id, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Pipeline not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        _raise_noodle_control_plane_error(exc)


@router.post("/pipelines/{pipeline_id}/runs/{run_id}/repair", response_model=NoodlePipelineRunResponse)
def noodle_repair_pipeline_run(
    pipeline_id: str,
    run_id: str,
    request: NoodlePipelineRepairRunRequest,
) -> NoodlePipelineRunResponse:
    try:
        return get_noodle_pipeline_control_plane().repair_run(pipeline_id, run_id, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Pipeline or run not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        _raise_noodle_control_plane_error(exc)


@router.post("/pipelines/{pipeline_id}/batch-sessions/{batch_session_id}/resume", response_model=NoodlePipelineBatchResumeResponse)
def noodle_resume_pipeline_batch_session(
    pipeline_id: str,
    batch_session_id: str,
    request: NoodlePipelineBatchResumeRequest,
) -> NoodlePipelineBatchResumeResponse:
    try:
        return get_noodle_pipeline_control_plane().resume_batch_session(pipeline_id, batch_session_id, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Pipeline or batch session not found.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        _raise_noodle_control_plane_error(exc)


router.include_router(microservices_router)
