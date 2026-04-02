from fastapi import APIRouter, Depends, HTTPException, Request

from app.allocator.control_plane import get_allocator_control_plane
from app.allocator.schemas import (
    AllocationActionRequest,
    AllocatorRunCreateRequest,
    AllocatorRunListResponse,
    AllocatorRunRecord,
    AllocatorRunResponse,
    ApprovalActionRequest,
    AuditLogListResponse,
    BudgetValidationActionRequest,
    PendingApprovalListResponse,
)
from app.allocator.services.authorization import AllocatorAuthorizationError, AllocatorPreconditionError
from app.rbac.dependencies import get_current_principal, require_permissions
from app.rbac.middleware import set_audit_event
from app.rbac.schemas import PermissionName, Principal


router = APIRouter(prefix="/allocator", tags=["allocator"])


@router.post("/runs", response_model=AllocatorRunResponse)
def create_allocator_run(
    request: AllocatorRunCreateRequest,
    fastapi_request: Request,
    principal: Principal = Depends(require_permissions(PermissionName.CREATE_ESTIMATION)),
) -> AllocatorRunResponse:
    try:
        response = get_allocator_control_plane().submit_run(
            request.model_copy(update={"requested_by": principal.email}),
            principal,
        )
        set_audit_event(
            fastapi_request,
            action="create_estimation",
            resource_type="allocator_run",
            resource_id=str(response.run.id),
            metadata={
                "requested_by": principal.email,
                "requested_by_user_id": principal.sub,
                "target_provider": response.run.payload.approved_estimation.recommended_provider.value,
            },
        )
        return response
    except AllocatorAuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/runs", response_model=AllocatorRunListResponse)
def list_allocator_runs() -> AllocatorRunListResponse:
    return get_allocator_control_plane().list_runs()


@router.get("/runs/{run_id}", response_model=AllocatorRunRecord)
def get_allocator_run(run_id: int) -> AllocatorRunRecord:
    try:
        return get_allocator_control_plane().get_run(run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Allocator run not found.") from exc


@router.get("/approvals/pending", response_model=PendingApprovalListResponse)
def list_pending_allocator_approvals() -> PendingApprovalListResponse:
    return get_allocator_control_plane().list_pending_approvals()


@router.post("/approvals/{run_id}/approve", response_model=AllocatorRunResponse)
def approve_allocator_run(
    run_id: int,
    request: ApprovalActionRequest,
    fastapi_request: Request,
    principal: Principal = Depends(require_permissions(PermissionName.APPROVE_REQUEST)),
) -> AllocatorRunResponse:
    try:
        response = get_allocator_control_plane().approve_run(
            run_id,
            request.model_copy(update={"reviewer": principal.email}),
            principal,
        )
        set_audit_event(
            fastapi_request,
            action="approve_request",
            resource_type="allocator_run",
            resource_id=str(run_id),
            metadata={
                "approved_by": principal.email,
                "approved_by_user_id": principal.sub,
                "comment": request.comment,
                "approval_status": response.run.approval_status.value,
            },
        )
        return response
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Allocator run not found.") from exc
    except AllocatorAuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (AllocatorPreconditionError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/approvals/{run_id}/reject", response_model=AllocatorRunResponse)
def reject_allocator_run(
    run_id: int,
    request: ApprovalActionRequest,
    fastapi_request: Request,
    principal: Principal = Depends(require_permissions(PermissionName.REJECT_REQUEST)),
) -> AllocatorRunResponse:
    try:
        response = get_allocator_control_plane().reject_run(
            run_id,
            request.model_copy(update={"reviewer": principal.email}),
            principal,
        )
        set_audit_event(
            fastapi_request,
            action="reject_request",
            resource_type="allocator_run",
            resource_id=str(run_id),
            metadata={
                "rejected_by": principal.email,
                "rejected_by_user_id": principal.sub,
                "comment": request.comment,
            },
        )
        return response
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Allocator run not found.") from exc
    except AllocatorAuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (AllocatorPreconditionError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/runs/{run_id}/budget-validation", response_model=AllocatorRunResponse)
def validate_allocator_budget(
    run_id: int,
    request: BudgetValidationActionRequest,
    fastapi_request: Request,
    principal: Principal = Depends(require_permissions(PermissionName.VIEW_COST)),
) -> AllocatorRunResponse:
    try:
        response = get_allocator_control_plane().validate_budget(
            run_id,
            request.model_copy(update={"reviewer": principal.email}),
            principal,
        )
        set_audit_event(
            fastapi_request,
            action="budget_validation",
            resource_type="allocator_run",
            resource_id=str(run_id),
            metadata={
                "validated_by": principal.email,
                "validated_by_user_id": principal.sub,
                "comment": request.comment,
                "budget_validation_status": response.run.budget_validation_status.value,
            },
        )
        return response
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Allocator run not found.") from exc
    except AllocatorAuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (AllocatorPreconditionError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/runs/{run_id}/allocate", response_model=AllocatorRunResponse)
def allocate_allocator_run(
    run_id: int,
    request: AllocationActionRequest,
    fastapi_request: Request,
    principal: Principal = Depends(require_permissions(PermissionName.ALLOCATE_RESOURCES)),
) -> AllocatorRunResponse:
    try:
        response = get_allocator_control_plane().allocate_run(
            run_id,
            request.model_copy(update={"operator": principal.email}),
            principal,
        )
        set_audit_event(
            fastapi_request,
            action="allocate_resources",
            resource_type="allocator_run",
            resource_id=str(run_id),
            metadata={
                "triggered_by": principal.email,
                "triggered_by_user_id": principal.sub,
                "comment": request.comment,
                "provisioning_applied": response.run.provisioning_result.applied if response.run.provisioning_result else False,
                "execution_reference": response.run.provisioning_result.execution_reference if response.run.provisioning_result else None,
            },
        )
        return response
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Allocator run not found.") from exc
    except AllocatorAuthorizationError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (AllocatorPreconditionError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/allocate/{run_id}", response_model=AllocatorRunResponse)
def allocate_allocator_run_alias(
    run_id: int,
    request: AllocationActionRequest,
    fastapi_request: Request,
    principal: Principal = Depends(require_permissions(PermissionName.ALLOCATE_RESOURCES)),
) -> AllocatorRunResponse:
    return allocate_allocator_run(run_id, request, fastapi_request, principal)


@router.get("/audit-logs", response_model=AuditLogListResponse)
def list_allocator_audit_logs(
    _: Principal = Depends(get_current_principal),
) -> AuditLogListResponse:
    return get_allocator_control_plane().list_audit_logs()
