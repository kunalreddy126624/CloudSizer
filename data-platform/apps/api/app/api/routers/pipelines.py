from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.pipeline_repository import PipelineRepository
from app.repositories.run_repository import RunRepository
from app.schemas.pipeline import PipelineCreate, PipelineRead, PipelineUpdate, ValidationIssue
from app.schemas.run import PipelineRunRead
from app.services.pipeline_service import PipelineService
from app.services.run_service import RunService
from app.services.validation_service import ValidationService

router = APIRouter(prefix="/pipelines", tags=["pipelines"])


def get_pipeline_service(session: Session = Depends(get_db)) -> PipelineService:
    return PipelineService(PipelineRepository(session), ValidationService())


def get_run_service(session: Session = Depends(get_db)) -> RunService:
    return RunService(PipelineRepository(session), RunRepository(session))


def _raise_not_found(exc: ValueError) -> None:
    raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("", response_model=list[PipelineRead])
def list_pipelines(service: PipelineService = Depends(get_pipeline_service)) -> list[PipelineRead]:
    return service.list_pipelines()


@router.post("", response_model=PipelineRead, status_code=201)
def create_pipeline(
    payload: PipelineCreate,
    service: PipelineService = Depends(get_pipeline_service),
) -> PipelineRead:
    return service.create_pipeline(payload)


@router.get("/{pipeline_id}", response_model=PipelineRead)
def get_pipeline(
    pipeline_id: str,
    service: PipelineService = Depends(get_pipeline_service),
) -> PipelineRead:
    try:
        return service.get_pipeline(pipeline_id)
    except ValueError as exc:
        _raise_not_found(exc)


@router.put("/{pipeline_id}", response_model=PipelineRead)
def update_pipeline(
    pipeline_id: str,
    payload: PipelineUpdate,
    service: PipelineService = Depends(get_pipeline_service),
) -> PipelineRead:
    try:
        return service.update_pipeline(pipeline_id, payload)
    except ValueError as exc:
        _raise_not_found(exc)


@router.post("/{pipeline_id}/validate", response_model=list[ValidationIssue])
def validate_pipeline(
    pipeline_id: str,
    service: PipelineService = Depends(get_pipeline_service),
) -> list[ValidationIssue]:
    try:
        return service.validate_pipeline(pipeline_id)
    except ValueError as exc:
        _raise_not_found(exc)


@router.post("/{pipeline_id}/publish", response_model=PipelineRead)
def publish_pipeline(
    pipeline_id: str,
    service: PipelineService = Depends(get_pipeline_service),
) -> PipelineRead:
    try:
        return service.publish_pipeline(pipeline_id)
    except ValueError as exc:
        _raise_not_found(exc)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{pipeline_id}/run", response_model=PipelineRunRead)
def run_pipeline(
    pipeline_id: str,
    service: RunService = Depends(get_run_service),
) -> PipelineRunRead:
    try:
        return service.create_run(pipeline_id)
    except ValueError as exc:
        _raise_not_found(exc)


@router.get("/{pipeline_id}/runs", response_model=list[PipelineRunRead])
def list_pipeline_runs(
    pipeline_id: str,
    service: RunService = Depends(get_run_service),
) -> list[PipelineRunRead]:
    try:
        return service.list_runs(pipeline_id)
    except ValueError as exc:
        _raise_not_found(exc)
