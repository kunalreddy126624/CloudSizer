"""RBAC package for JWT authentication, authorization, and audit logging."""

from app.rbac.api import router as rbac_router

__all__ = ["rbac_router"]
