from __future__ import annotations

from fastapi import APIRouter

from app.noodle.microservices.api import router as microservices_router
from app.noodle.schemas import (
    NoodleArchitectureOverview,
    NoodlePipelineIntent,
    NoodlePipelinePlanResponse,
    NoodlePlatformBlueprint,
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
def noodle_plan_pipeline(intent: NoodlePipelineIntent) -> NoodlePipelinePlanResponse:
    return get_noodle_service().plan_pipeline(intent)


router.include_router(microservices_router)
