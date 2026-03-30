from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.models import (
    AuthLoginRequest,
    AuthLoginResponse,
    AuthenticatedUser,
    EstimationAdvisorRequest,
    EstimationAdvisorResponse,
    EstimationAdvisorChatRequest,
    EstimationAdvisorChatResponse,
    CatalogImportRequest,
    CatalogImportResponse,
    CatalogService,
    CloudProvider,
    SavedEstimateCreate,
    SavedEstimateRecord,
    ProviderSummary,
    RecommendationRequest,
    RecommendationResponse,
    ServiceCategory,
    ServiceComparisonGroup,
    ServicePricingRequest,
    ServicePricingResponse,
)
from app.services.advisor import advise_estimation_chat, advise_estimation_plan
from app.services.auth import authenticate_user, create_session, get_user_for_token, revoke_session
from app.services.catalog_import import import_catalog_snapshot
from app.services.catalog import (
    get_catalog_services,
    get_catalog_metadata,
    get_provider_summaries,
    get_service_comparison_groups,
    reload_catalog,
)
from app.services.estimates import (
    create_saved_estimate,
    delete_saved_estimate,
    get_saved_estimate,
    list_saved_estimates,
)
from app.services.recommendation import build_recommendations
from app.services.service_pricing import calculate_service_pricing


router = APIRouter()
auth_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
) -> AuthenticatedUser:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required.")

    user = get_user_for_token(credentials.credentials)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session.")

    return user


@router.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/providers", response_model=list[ProviderSummary])
def list_providers() -> list[ProviderSummary]:
    return get_provider_summaries()


@router.get("/catalog/services", response_model=list[CatalogService])
def list_catalog_services(
    provider: CloudProvider | None = None,
    category: ServiceCategory | None = None,
) -> list[CatalogService]:
    return get_catalog_services(provider=provider, category=category)


@router.get("/catalog/comparisons", response_model=list[ServiceComparisonGroup])
def list_service_comparisons(
    category: ServiceCategory | None = None,
) -> list[ServiceComparisonGroup]:
    return get_service_comparison_groups(category=category)


@router.get("/catalog/metadata")
def catalog_metadata() -> dict[str, int | str]:
    return get_catalog_metadata()


@router.post("/catalog/reload")
def catalog_reload() -> dict[str, str]:
    reload_catalog()
    return {"status": "reloaded"}


@router.post("/catalog/import-local", response_model=CatalogImportResponse)
def catalog_import_local(
    request: CatalogImportRequest,
) -> CatalogImportResponse:
    return import_catalog_snapshot(request)


@router.post("/pricing/calculate", response_model=ServicePricingResponse)
def calculate_pricing(
    request: ServicePricingRequest,
) -> ServicePricingResponse:
    return calculate_service_pricing(request)


@router.post("/advisor/estimate-plan", response_model=EstimationAdvisorResponse)
def estimate_plan(
    request: EstimationAdvisorRequest,
) -> EstimationAdvisorResponse:
    return advise_estimation_plan(request)


@router.post("/advisor/chat", response_model=EstimationAdvisorChatResponse)
def advisor_chat(
    request: EstimationAdvisorChatRequest,
) -> EstimationAdvisorChatResponse:
    return advise_estimation_chat(request)


@router.post("/auth/login", response_model=AuthLoginResponse)
def auth_login(request: AuthLoginRequest) -> AuthLoginResponse:
    user = authenticate_user(request.email, request.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    return AuthLoginResponse(
        access_token=create_session(user.id, remember_me=request.remember_me),
        user=user,
    )


@router.get("/auth/me", response_model=AuthenticatedUser)
def auth_me(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    return current_user


@router.post("/auth/logout")
def auth_logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
) -> dict[str, str]:
    if credentials is not None:
        revoke_session(credentials.credentials)
    return {"status": "logged_out"}


@router.get("/estimates", response_model=list[SavedEstimateRecord])
def estimates_list(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> list[SavedEstimateRecord]:
    return list_saved_estimates(current_user.id)


@router.get("/estimates/{estimate_id}", response_model=SavedEstimateRecord)
def estimates_get(
    estimate_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> SavedEstimateRecord:
    try:
        return get_saved_estimate(estimate_id, current_user.id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Estimate not found.") from exc


@router.post("/estimates", response_model=SavedEstimateRecord)
def estimates_create(
    request: SavedEstimateCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> SavedEstimateRecord:
    return create_saved_estimate(request, current_user.id)


@router.delete("/estimates/{estimate_id}")
def estimates_delete(
    estimate_id: int,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, str]:
    if not delete_saved_estimate(estimate_id, current_user.id):
        raise HTTPException(status_code=404, detail="Estimate not found.")
    return {"status": "deleted"}


@router.post("/recommendations", response_model=RecommendationResponse)
def recommend_architecture(
    request: RecommendationRequest,
) -> RecommendationResponse:
    return build_recommendations(request)
