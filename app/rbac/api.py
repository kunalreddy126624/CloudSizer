from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.rbac.dependencies import get_current_principal, require_permissions
from app.rbac.middleware import set_audit_event
from app.rbac.schemas import (
    ActionResponse,
    AuditLogQuery,
    AuditLogListResponse,
    EstimationCreate,
    EstimationListResponse,
    PermissionName,
    Principal,
    RbacLoginRequest,
    RbacRoleAssignmentRequest,
    RbacUserCreate,
    TokenResponse,
    UserRead,
)
from app.rbac.service import get_rbac_service


router = APIRouter(prefix="/rbac", tags=["rbac"])


@router.post("/auth/login", response_model=TokenResponse)
def rbac_login(request: RbacLoginRequest, fastapi_request: Request) -> TokenResponse:
    token = get_rbac_service().authenticate(request.email, request.password)
    if token is None:
        get_rbac_service().record_login_attempt(
            email=request.email,
            success=False,
            request_path=str(fastapi_request.url.path),
            method=fastapi_request.method,
            metadata={"reason": "invalid_credentials"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    get_rbac_service().record_login_attempt(
        email=request.email,
        success=True,
        request_path=str(fastapi_request.url.path),
        method=fastapi_request.method,
        user_id=token.user.id,
        metadata={"roles": [role.name.value for role in token.user.roles]},
    )
    return token


@router.get("/auth/me")
def rbac_me(principal: Principal = Depends(get_current_principal)) -> Principal:
    return principal


@router.post("/users", response_model=UserRead)
def create_rbac_user(
    request: RbacUserCreate,
    _: Principal = Depends(require_permissions(PermissionName.MANAGE_USERS)),
) -> UserRead:
    try:
        return get_rbac_service().create_user(request.email, request.full_name, request.password, request.roles)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/users", response_model=list[UserRead])
def list_rbac_users(
    _: Principal = Depends(require_permissions(PermissionName.MANAGE_USERS)),
) -> list[UserRead]:
    return get_rbac_service().list_users()


@router.post("/users/{user_id}/roles", response_model=UserRead)
def assign_rbac_roles(
    user_id: int,
    request: RbacRoleAssignmentRequest,
    fastapi_request: Request,
    _: Principal = Depends(require_permissions(PermissionName.MANAGE_USERS)),
) -> UserRead:
    set_audit_event(
        fastapi_request,
        action="manage_user_roles",
        resource_type="user",
        resource_id=str(user_id),
        metadata={"roles": [role.value for role in request.roles]},
    )
    try:
        return get_rbac_service().assign_roles(user_id, request.roles)
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/estimations", response_model=ActionResponse)
def create_estimation_example(
    request: EstimationCreate,
    fastapi_request: Request,
    principal: Principal = Depends(require_permissions(PermissionName.CREATE_ESTIMATION)),
) -> ActionResponse:
    record = get_rbac_service().create_estimation(principal.sub, request)
    set_audit_event(
        fastapi_request,
        action="create_estimation",
        resource_type="estimation",
        resource_id=str(record.id),
        metadata={"provider": record.provider},
    )
    return ActionResponse(status="created", message=f"Estimation {record.id} created.")


@router.get("/estimations", response_model=EstimationListResponse)
def list_estimations_example(
    _: Principal = Depends(require_permissions(PermissionName.VIEW_ESTIMATION)),
) -> EstimationListResponse:
    return EstimationListResponse(items=get_rbac_service().list_estimations())


@router.post("/estimations/{estimation_id}/approve", response_model=ActionResponse)
def approve_estimation_example(
    estimation_id: int,
    fastapi_request: Request,
    principal: Principal = Depends(require_permissions(PermissionName.APPROVE_REQUEST)),
) -> ActionResponse:
    try:
        get_rbac_service().update_estimation_status(estimation_id, status="approved", approver_id=principal.sub)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    set_audit_event(
        fastapi_request,
        action="approve_request",
        resource_type="estimation",
        resource_id=str(estimation_id),
        metadata={"approved_by": principal.email, "approved_by_user_id": principal.sub},
    )
    return ActionResponse(status="approved", message=f"Estimation {estimation_id} approved.")


@router.post("/estimations/{estimation_id}/reject", response_model=ActionResponse)
def reject_estimation_example(
    estimation_id: int,
    fastapi_request: Request,
    principal: Principal = Depends(require_permissions(PermissionName.REJECT_REQUEST)),
) -> ActionResponse:
    try:
        get_rbac_service().update_estimation_status(estimation_id, status="rejected")
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    set_audit_event(
        fastapi_request,
        action="reject_request",
        resource_type="estimation",
        resource_id=str(estimation_id),
        metadata={"rejected_by": principal.email, "rejected_by_user_id": principal.sub},
    )
    return ActionResponse(status="rejected", message=f"Estimation {estimation_id} rejected.")


@router.post("/estimations/{estimation_id}/allocate", response_model=ActionResponse)
def allocate_resources_example(
    estimation_id: int,
    fastapi_request: Request,
    principal: Principal = Depends(require_permissions(PermissionName.ALLOCATE_RESOURCES)),
) -> ActionResponse:
    try:
        get_rbac_service().update_estimation_status(estimation_id, status="allocating")
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    set_audit_event(
        fastapi_request,
        action="allocate_resources",
        resource_type="estimation",
        resource_id=str(estimation_id),
        metadata={"triggered_by": principal.email, "triggered_by_user_id": principal.sub},
    )
    return ActionResponse(status="accepted", message=f"Allocation triggered for estimation {estimation_id}.")


@router.get("/estimations/{estimation_id}/cost", response_model=dict)
def view_estimation_cost_example(
    estimation_id: int,
    _: Principal = Depends(require_permissions(PermissionName.VIEW_COST)),
) -> dict:
    items = {item.id: item for item in get_rbac_service().list_estimations()}
    estimation = items.get(estimation_id)
    if estimation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Estimation not found.")
    return {
        "estimation_id": estimation.id,
        "estimated_monthly_cost_usd": estimation.estimated_monthly_cost_usd,
        "status": estimation.status,
    }


@router.get("/audit-logs", response_model=AuditLogListResponse)
def view_audit_logs_example(
    user_id: int | None = None,
    action: str | None = None,
    resource_id: str | None = None,
    limit: int = 100,
    _: Principal = Depends(require_permissions(PermissionName.VIEW_LOGS)),
) -> AuditLogListResponse:
    return AuditLogListResponse(
        items=get_rbac_service().list_audit_logs(
            AuditLogQuery(user_id=user_id, action=action, resource_id=resource_id, limit=limit)
        )
    )
