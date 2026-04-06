from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.rbac.schemas import PermissionName, Principal
from app.rbac.security import decode_access_token
from app.rbac.service import get_rbac_service


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> Principal:
    if hasattr(request.state, "rbac_principal") and request.state.rbac_principal is not None:
        return request.state.rbac_principal
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    try:
        principal = decode_access_token(get_rbac_service().settings, credentials.credentials)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token.") from exc
    request.state.rbac_principal = principal
    return principal


def require_permissions(*required: PermissionName) -> Callable[[Principal], Principal]:
    def dependency(principal: Principal = Depends(get_current_principal)) -> Principal:
        granted = set(principal.permissions)
        missing = [permission.value for permission in required if permission not in granted]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission(s): {', '.join(missing)}.",
            )
        return principal

    return dependency
