from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.pipeline_repository import PipelineRepository
from app.repositories.run_repository import RunRepository
from app.schemas.run import PipelineRunRead, RunLogRead, TaskRunRead
from app.services.run_service import RunService

router = APIRouter(tags=["runs"])


def get_service(session: Session = Depends(get_db)) -> RunService:
    return RunService(PipelineRepository(session), RunRepository(session))


@router.get("/runs/{run_id}", response_model=PipelineRunRead)
def get_run(run_id: str, service: RunService = Depends(get_service)) -> PipelineRunRead:
    try:
        return service.get_run(run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/runs/{run_id}/tasks", response_model=list[TaskRunRead])
def get_run_tasks(run_id: str, service: RunService = Depends(get_service)) -> list[TaskRunRead]:
    try:
        return service.list_tasks(run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/runs/{run_id}/logs", response_model=list[RunLogRead])
def get_run_logs(run_id: str, service: RunService = Depends(get_service)) -> list[RunLogRead]:
    try:
        return service.list_logs(run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/runs/{run_id}/cancel", response_model=PipelineRunRead)
def cancel_run(run_id: str, service: RunService = Depends(get_service)) -> PipelineRunRead:
    try:
        return service.cancel_run(run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/tasks/{task_run_id}/retry", response_model=TaskRunRead)
def retry_task(task_run_id: str, service: RunService = Depends(get_service)) -> TaskRunRead:
    try:
        return service.retry_task(task_run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
