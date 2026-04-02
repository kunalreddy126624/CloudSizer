from __future__ import annotations

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.rbac.schemas import Principal
from app.rbac.security import decode_access_token
from app.rbac.service import get_rbac_service


class RbacContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request.state.rbac_principal = None
        authorization = request.headers.get("Authorization", "")
        if authorization.startswith("Bearer "):
            token = authorization.removeprefix("Bearer ").strip()
            try:
                request.state.rbac_principal = decode_access_token(get_rbac_service().settings, token)
            except Exception:
                request.state.rbac_principal = None
        return await call_next(request)


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        audit_event = getattr(request.state, "audit_event", None)
        principal: Principal | None = getattr(request.state, "rbac_principal", None)
        if audit_event is not None:
            get_rbac_service().write_audit_log(
                user_id=principal.sub if principal else None,
                action=audit_event["action"],
                resource_type=audit_event["resource_type"],
                resource_id=audit_event.get("resource_id"),
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                metadata=audit_event.get("metadata", {}),
            )
        return response


def set_audit_event(
    request: Request,
    *,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    metadata: dict | None = None,
    detail: dict | None = None,
) -> None:
    request.state.audit_event = {
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "metadata": metadata if metadata is not None else (detail or {}),
    }
