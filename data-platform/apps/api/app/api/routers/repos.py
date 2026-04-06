from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.repo_repository import RepoRepository
from app.schemas.repo import (
    ArtifactCreate,
    ArtifactRead,
    ArtifactUpdate,
    ArtifactVersionRead,
    PublishArtifactResponse,
    RepoCreate,
    RepoRead,
    RepoTreeResponse,
)
from app.services.repo_service import RepoService

router = APIRouter(prefix="/repos", tags=["repos"])
artifact_router = APIRouter(tags=["artifacts"])


def get_service(session: Session = Depends(get_db)) -> RepoService:
    return RepoService(RepoRepository(session))


@router.get("", response_model=list[RepoRead])
def list_repos(service: RepoService = Depends(get_service)) -> list[RepoRead]:
    return service.list_repos()


@router.post("", response_model=RepoRead, status_code=201)
def create_repo(payload: RepoCreate, service: RepoService = Depends(get_service)) -> RepoRead:
    return service.create_repo(payload)


@router.get("/{repo_id}/tree", response_model=RepoTreeResponse)
def get_repo_tree(repo_id: str, service: RepoService = Depends(get_service)) -> RepoTreeResponse:
    try:
        return service.get_repo_tree(repo_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{repo_id}/artifacts", response_model=ArtifactRead, status_code=201)
def create_artifact(repo_id: str, payload: ArtifactCreate, service: RepoService = Depends(get_service)) -> ArtifactRead:
    try:
        return service.create_artifact(repo_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@artifact_router.get("/artifacts/{artifact_id}", response_model=ArtifactRead)
def get_artifact(artifact_id: str, service: RepoService = Depends(get_service)) -> ArtifactRead:
    try:
        return service.get_artifact(artifact_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@artifact_router.put("/artifacts/{artifact_id}", response_model=ArtifactRead)
def update_artifact(artifact_id: str, payload: ArtifactUpdate, service: RepoService = Depends(get_service)) -> ArtifactRead:
    try:
        return service.update_artifact(artifact_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@artifact_router.get("/artifacts/{artifact_id}/versions", response_model=list[ArtifactVersionRead])
def get_artifact_versions(artifact_id: str, service: RepoService = Depends(get_service)) -> list[ArtifactVersionRead]:
    try:
        return service.list_artifact_versions(artifact_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@artifact_router.post("/artifacts/{artifact_id}/publish", response_model=PublishArtifactResponse)
def publish_artifact(artifact_id: str, service: RepoService = Depends(get_service)) -> PublishArtifactResponse:
    try:
        return service.publish_artifact(artifact_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
