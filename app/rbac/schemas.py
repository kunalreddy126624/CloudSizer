from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RoleName(str, Enum):
    ADMIN = "admin"
    ARCHITECT = "architect"
    APPROVER = "approver"
    FINOPS = "finops"
    OPERATOR = "operator"
    VIEWER = "viewer"


class PermissionName(str, Enum):
    CREATE_ESTIMATION = "create_estimation"
    VIEW_ESTIMATION = "view_estimation"
    APPROVE_REQUEST = "approve_request"
    REJECT_REQUEST = "reject_request"
    ALLOCATE_RESOURCES = "allocate_resources"
    VIEW_COST = "view_cost"
    MANAGE_USERS = "manage_users"
    VIEW_LOGS = "view_logs"


class RbacUserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    full_name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    roles: list[RoleName] = Field(default_factory=lambda: [RoleName.VIEWER])


class RbacLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class RbacRoleAssignmentRequest(BaseModel):
    roles: list[RoleName] = Field(min_length=1)


class PermissionRead(BaseModel):
    name: PermissionName
    description: str


class RoleRead(BaseModel):
    name: RoleName
    description: str
    permissions: list[PermissionRead]


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    is_active: bool
    roles: list[RoleRead]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class Principal(BaseModel):
    sub: int
    email: str
    roles: list[RoleName]
    permissions: list[PermissionName]


class EstimationCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    provider: str = Field(min_length=2, max_length=64)
    estimated_monthly_cost_usd: float = Field(ge=0.0)
    payload: dict[str, Any] = Field(default_factory=dict)


class EstimationRead(BaseModel):
    id: int
    title: str
    provider: str
    status: str
    estimated_monthly_cost_usd: float
    payload: dict[str, Any]
    created_by: int
    approved_by: int | None = None


class EstimationListResponse(BaseModel):
    items: list[EstimationRead]


class ActionResponse(BaseModel):
    status: str
    message: str


class AuditLogQuery(BaseModel):
    user_id: int | None = None
    action: str | None = None
    resource_id: str | None = None
    limit: int = Field(default=100, ge=1, le=500)


class AuditLogRead(BaseModel):
    id: int
    user_id: int | None = None
    action: str
    resource_type: str
    resource_id: str | None = None
    timestamp: str
    metadata: dict[str, Any]
    method: str
    path: str
    status_code: int
    detail_json: dict[str, Any]
    created_at: str


class AuditLogListResponse(BaseModel):
    items: list[AuditLogRead]
