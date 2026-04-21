from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.models import CloudProvider, ResourceAllocatorRequest


class AllocatorRunStatus(str, Enum):
    DRAFT = "draft"
    VALIDATED = "validated"
    AWAITING_APPROVAL = "awaiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    PROVISIONING = "provisioning"
    COMPLETED = "completed"
    FAILED = "failed"


class ApprovalDecision(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class BudgetValidationStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AllocatorRunCreateRequest(BaseModel):
    requested_by: str = Field(min_length=2)
    change_reason: str = Field(min_length=5)
    payload: ResourceAllocatorRequest


class ApprovalActionRequest(BaseModel):
    reviewer: str = Field(min_length=2)
    comment: str = Field(default="", max_length=500)


class BudgetValidationActionRequest(BaseModel):
    reviewer: str = Field(min_length=2)
    comment: str = Field(default="", max_length=500)


class AllocationActionRequest(BaseModel):
    operator: str = Field(min_length=2)
    comment: str = Field(default="", max_length=500)


class TerraformBundleFile(BaseModel):
    path: str
    content: str


class TerraformBundle(BaseModel):
    modules: list[str] = Field(default_factory=list)
    files: list[TerraformBundleFile] = Field(default_factory=list)


class CloudAccountPlan(BaseModel):
    provider: CloudProvider
    reuse_existing: bool
    resource_kind: str
    account_name: str
    organizational_unit: str
    billing_scope: str | None = None
    account_email: str | None = None
    existing_account_id: str | None = None
    target_account_id: str | None = None
    target_account_arn: str | None = None
    provisioning_reference: str | None = None
    rationale: str


class WorkflowValidationResult(BaseModel):
    passed: bool
    violations: list[str] = Field(default_factory=list)


class WorkflowCostResult(BaseModel):
    currency: str
    estimated_monthly_cost: float
    within_budget: bool
    line_items: list[dict[str, Any]] = Field(default_factory=list)


class ProvisioningResult(BaseModel):
    applied: bool = False
    account_created: bool = False
    terraform_artifact_path: str | None = None
    execution_reference: str | None = None
    execution_log_path: str | None = None
    runner_mode: str | None = None
    message: str = ""


class AuditLogRecord(BaseModel):
    id: int
    run_id: int | None = None
    actor: str
    action: str
    detail: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class AllocatorRunRecord(BaseModel):
    id: int
    requested_by: str
    change_reason: str
    status: AllocatorRunStatus
    approval_status: ApprovalStatus
    budget_validation_status: BudgetValidationStatus = BudgetValidationStatus.PENDING
    summary: str
    payload: ResourceAllocatorRequest
    account_plan: CloudAccountPlan | None = None
    terraform_bundle: TerraformBundle | None = None
    cost_result: WorkflowCostResult | None = None
    policy_result: WorkflowValidationResult | None = None
    provisioning_result: ProvisioningResult | None = None
    workflow_trace: list[str] = Field(default_factory=list)
    error_message: str | None = None
    created_at: str
    updated_at: str
    reviewed_by: str | None = None
    reviewed_at: str | None = None
    review_comment: str | None = None
    budget_validated_by: str | None = None
    budget_validated_at: str | None = None
    budget_validation_comment: str | None = None


class AllocatorRunListResponse(BaseModel):
    runs: list[AllocatorRunRecord]


class PendingApprovalRecord(BaseModel):
    run_id: int
    requested_by: str
    summary: str
    created_at: str
    approval_status: ApprovalStatus


class PendingApprovalListResponse(BaseModel):
    approvals: list[PendingApprovalRecord]


class AuditLogListResponse(BaseModel):
    logs: list[AuditLogRecord]


class ToolExecutionSnapshot(BaseModel):
    name: str
    status: str
    message: str


class AllocatorRunResponse(BaseModel):
    run: AllocatorRunRecord
    tools: list[ToolExecutionSnapshot] = Field(default_factory=list)


def utc_now() -> str:
    return datetime.now(UTC).isoformat()
