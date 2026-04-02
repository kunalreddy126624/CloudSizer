from __future__ import annotations

from app.allocator.schemas import AllocatorRunRecord, ApprovalStatus, BudgetValidationStatus
from app.rbac.schemas import PermissionName, Principal, RoleName


class AllocatorAuthorizationError(PermissionError):
    pass


class AllocatorPreconditionError(ValueError):
    pass


class AllocatorAuthorizationService:
    def ensure_can_submit(self, principal: Principal) -> None:
        self._ensure_permission(principal, PermissionName.CREATE_ESTIMATION)
        self._ensure_roles(principal, {RoleName.ARCHITECT, RoleName.ADMIN}, "Only ARCHITECT or ADMIN can submit allocator runs.")

    def ensure_can_approve(self, principal: Principal) -> None:
        self._ensure_permission(principal, PermissionName.APPROVE_REQUEST)
        self._ensure_roles(principal, {RoleName.APPROVER, RoleName.ADMIN}, "Only APPROVER or ADMIN can approve allocator runs.")

    def ensure_can_reject(self, principal: Principal) -> None:
        self._ensure_permission(principal, PermissionName.REJECT_REQUEST)
        self._ensure_roles(principal, {RoleName.APPROVER, RoleName.ADMIN}, "Only APPROVER or ADMIN can reject allocator runs.")

    def ensure_can_validate_budget(self, principal: Principal) -> None:
        self._ensure_permission(principal, PermissionName.VIEW_COST)
        self._ensure_roles(principal, {RoleName.FINOPS, RoleName.ADMIN}, "Only FINOPS or ADMIN can validate allocator budgets.")

    def ensure_can_allocate(self, principal: Principal) -> None:
        self._ensure_permission(principal, PermissionName.ALLOCATE_RESOURCES)
        self._ensure_roles(principal, {RoleName.OPERATOR, RoleName.ADMIN}, "Only OPERATOR or ADMIN can trigger allocation.")

    def ensure_budget_ready(self, run: AllocatorRunRecord) -> None:
        if run.approval_status != ApprovalStatus.APPROVED:
            raise AllocatorPreconditionError("Allocator run must be approved before allocation.")
        if run.budget_validation_status != BudgetValidationStatus.APPROVED:
            raise AllocatorPreconditionError("Allocator run must be budget-validated by FINOPS before allocation.")
        if run.policy_result is None or not run.policy_result.passed:
            raise AllocatorPreconditionError("Allocator run failed policy validation and cannot be provisioned.")
        if run.cost_result is None or not run.cost_result.within_budget:
            raise AllocatorPreconditionError("Allocator run is not within budget and cannot be provisioned.")

    def ensure_approvable(self, run: AllocatorRunRecord) -> None:
        if run.approval_status != ApprovalStatus.PENDING:
            raise AllocatorPreconditionError("Only pending allocator runs can be approved.")

    def ensure_rejectable(self, run: AllocatorRunRecord) -> None:
        if run.approval_status != ApprovalStatus.PENDING:
            raise AllocatorPreconditionError("Only pending allocator runs can be rejected.")

    def ensure_not_self_review(self, principal: Principal, run: AllocatorRunRecord) -> None:
        if RoleName.ADMIN in principal.roles:
            return
        if principal.email.strip().lower() == run.requested_by.strip().lower():
            raise AllocatorAuthorizationError("The requester cannot approve or reject their own allocator run.")

    def ensure_budget_validation_allowed(self, run: AllocatorRunRecord) -> None:
        if run.approval_status != ApprovalStatus.APPROVED:
            raise AllocatorPreconditionError("Budget validation requires an approved allocator run.")
        if run.status.value in {"completed", "provisioning"}:
            raise AllocatorPreconditionError("Budget validation can no longer be changed after provisioning starts.")

    def ensure_allocation_allowed(self, run: AllocatorRunRecord) -> None:
        if run.status.value in {"completed", "provisioning"}:
            raise AllocatorPreconditionError("Allocator run is already provisioning or completed.")
        if run.status.value in {"failed", "rejected"}:
            raise AllocatorPreconditionError("Rejected or failed allocator runs cannot be provisioned.")
        self.ensure_budget_ready(run)

    def _ensure_permission(self, principal: Principal, required: PermissionName) -> None:
        if required not in principal.permissions:
            raise AllocatorAuthorizationError(f"Missing required permission: {required.value}.")

    def _ensure_roles(self, principal: Principal, allowed: set[RoleName], message: str) -> None:
        granted_roles = set(principal.roles)
        if not granted_roles.intersection(allowed):
            raise AllocatorAuthorizationError(message)
