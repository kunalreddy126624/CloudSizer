from functools import lru_cache

from app.allocator.agent.workflow import AllocatorWorkflow, WorkflowState
from app.allocator.config import get_allocator_settings
from app.allocator.database import AllocatorDatabase
from app.allocator.repository import AllocatorRepository
from app.allocator.schemas import (
    AllocationActionRequest,
    AllocatorRunCreateRequest,
    AllocatorRunListResponse,
    AllocatorRunRecord,
    AllocatorRunResponse,
    AllocatorRunStatus,
    ApprovalActionRequest,
    ApprovalStatus,
    AuditLogListResponse,
    BudgetValidationActionRequest,
    BudgetValidationStatus,
    PendingApprovalListResponse,
    PendingApprovalRecord,
    utc_now,
)
from app.allocator.services.authorization import (
    AllocatorAuthorizationService,
)
from app.allocator.services.audit import AuditService
from app.allocator.services.cloud_accounts import CloudControlPlaneService
from app.allocator.services.costs import CostEstimationService
from app.allocator.services.policies import PolicyValidationService
from app.allocator.services.terraform import TerraformTemplateEngine
from app.rbac.schemas import Principal


class AllocatorControlPlane:
    def __init__(self) -> None:
        settings = get_allocator_settings()
        repository = AllocatorRepository(AllocatorDatabase(settings))
        self.repository = repository
        self.audit = AuditService(repository)
        self.authorization = AllocatorAuthorizationService()
        self.workflow = AllocatorWorkflow(
            cloud_control_plane=CloudControlPlaneService(settings),
            terraform_engine=TerraformTemplateEngine(settings),
            cost_service=CostEstimationService(settings),
            policy_service=PolicyValidationService(),
        )

    def submit_run(self, request: AllocatorRunCreateRequest, principal: Principal) -> AllocatorRunResponse:
        self.authorization.ensure_can_submit(principal)
        run = self.repository.create_run(request)
        self.audit.record(
            run_id=run.id,
            actor=principal.email,
            action="allocator.run_submitted",
            detail={"change_reason": request.change_reason},
        )
        state = self.workflow.plan(request.payload)
        return self._persist_planning_result(run, principal.email, state)

    def list_runs(self) -> AllocatorRunListResponse:
        return AllocatorRunListResponse(runs=self.repository.list_runs())

    def get_run(self, run_id: int) -> AllocatorRunRecord:
        return self.repository.get_run(run_id)

    def list_pending_approvals(self) -> PendingApprovalListResponse:
        runs = self.repository.list_pending_approvals()
        return PendingApprovalListResponse(
            approvals=[
                PendingApprovalRecord(
                    run_id=run.id,
                    requested_by=run.requested_by,
                    summary=run.summary,
                    created_at=run.created_at,
                    approval_status=run.approval_status,
                )
                for run in runs
            ]
        )

    def approve_run(self, run_id: int, request: ApprovalActionRequest, principal: Principal) -> AllocatorRunResponse:
        run = self.repository.get_run(run_id)
        self.authorization.ensure_can_approve(principal)
        self.authorization.ensure_approvable(run)
        self.authorization.ensure_not_self_review(principal, run)
        updated = self.repository.update_run(
            run_id,
            status=AllocatorRunStatus.APPROVED,
            approval_status=ApprovalStatus.APPROVED,
            summary="Allocator run approved. Waiting for FINOPS budget validation and OPERATOR allocation.",
            account_plan=run.account_plan,
            terraform_bundle=run.terraform_bundle,
            cost_result=run.cost_result,
            policy_result=run.policy_result,
            provisioning_result=run.provisioning_result,
            workflow_trace=[*run.workflow_trace, f"Run approved by {principal.email}."],
            error_message=None,
            reviewed_by=principal.email,
            reviewed_at=utc_now(),
            review_comment=request.comment,
        )
        self.audit.record(
            run_id=run_id,
            actor=principal.email,
            action="allocator.run_approved",
            detail={"comment": request.comment},
        )
        return AllocatorRunResponse(run=updated, tools=[])

    def reject_run(self, run_id: int, request: ApprovalActionRequest, principal: Principal) -> AllocatorRunResponse:
        run = self.repository.get_run(run_id)
        self.authorization.ensure_can_reject(principal)
        self.authorization.ensure_rejectable(run)
        self.authorization.ensure_not_self_review(principal, run)
        updated = self.repository.update_run(
            run_id,
            status=AllocatorRunStatus.REJECTED,
            approval_status=ApprovalStatus.REJECTED,
            summary="Allocator run rejected during approval review.",
            account_plan=run.account_plan,
            terraform_bundle=run.terraform_bundle,
            cost_result=run.cost_result,
            policy_result=run.policy_result,
            provisioning_result=run.provisioning_result,
            workflow_trace=[*run.workflow_trace, "Run rejected before provisioning."],
            error_message=request.comment or "Rejected during approval review.",
            reviewed_by=principal.email,
            reviewed_at=utc_now(),
            review_comment=request.comment,
            budget_validation_status=BudgetValidationStatus.REJECTED,
        )
        self.audit.record(
            run_id=run_id,
            actor=principal.email,
            action="allocator.run_rejected",
            detail={"comment": request.comment},
        )
        return AllocatorRunResponse(run=updated, tools=[])

    def validate_budget(
        self,
        run_id: int,
        request: BudgetValidationActionRequest,
        principal: Principal,
    ) -> AllocatorRunResponse:
        run = self.repository.get_run(run_id)
        self.authorization.ensure_can_validate_budget(principal)
        self.authorization.ensure_budget_validation_allowed(run)
        budget_status = BudgetValidationStatus.APPROVED if run.cost_result and run.cost_result.within_budget else BudgetValidationStatus.REJECTED
        summary = (
            "Budget validation approved. Run is ready for operator allocation."
            if budget_status == BudgetValidationStatus.APPROVED
            else "Budget validation failed. Allocation remains blocked."
        )
        error_message = None if budget_status == BudgetValidationStatus.APPROVED else "Budget validation failed."
        updated = self.repository.update_run(
            run_id,
            status=AllocatorRunStatus.APPROVED if budget_status == BudgetValidationStatus.APPROVED else AllocatorRunStatus.FAILED,
            approval_status=run.approval_status,
            budget_validation_status=budget_status,
            summary=summary,
            account_plan=run.account_plan,
            terraform_bundle=run.terraform_bundle,
            cost_result=run.cost_result,
            policy_result=run.policy_result,
            provisioning_result=run.provisioning_result,
            workflow_trace=[*run.workflow_trace, f"Budget validated by {principal.email}: {budget_status.value}."],
            error_message=error_message,
            reviewed_by=run.reviewed_by,
            reviewed_at=run.reviewed_at,
            review_comment=run.review_comment,
            budget_validated_by=principal.email,
            budget_validated_at=utc_now(),
            budget_validation_comment=request.comment,
        )
        self.audit.record(
            run_id=run_id,
            actor=principal.email,
            action="allocator.budget_validated",
            detail={"comment": request.comment, "status": budget_status.value},
        )
        return AllocatorRunResponse(run=updated, tools=[])

    def allocate_run(
        self,
        run_id: int,
        request: AllocationActionRequest,
        principal: Principal,
    ) -> AllocatorRunResponse:
        run = self.repository.get_run(run_id)
        self.authorization.ensure_can_allocate(principal)
        self.authorization.ensure_allocation_allowed(run)
        state = self._state_from_run(run)
        provisioning_run = self.repository.update_run(
            run_id,
            status=AllocatorRunStatus.PROVISIONING,
            approval_status=run.approval_status,
            budget_validation_status=run.budget_validation_status,
            summary="Allocator authorization checks passed. Provisioning in progress.",
            account_plan=run.account_plan,
            terraform_bundle=run.terraform_bundle,
            cost_result=run.cost_result,
            policy_result=run.policy_result,
            provisioning_result=run.provisioning_result,
            workflow_trace=[*run.workflow_trace, f"Allocation authorized by {principal.email}."],
            error_message=None,
            reviewed_by=run.reviewed_by,
            reviewed_at=run.reviewed_at,
            review_comment=run.review_comment,
            budget_validated_by=run.budget_validated_by,
            budget_validated_at=run.budget_validated_at,
            budget_validation_comment=run.budget_validation_comment,
        )
        state = self.workflow.provision(run_id, run.payload, self._state_from_run(provisioning_run))
        updated = self.repository.update_run(
            run_id,
            status=AllocatorRunStatus.COMPLETED if state["provisioning_result"].applied else AllocatorRunStatus.FAILED,
            approval_status=run.approval_status,
            budget_validation_status=run.budget_validation_status,
            summary=state.get("summary", "Allocator provisioning finished."),
            account_plan=state.get("account_plan"),
            terraform_bundle=state.get("terraform_bundle"),
            cost_result=state.get("cost_result"),
            policy_result=state.get("policy_result"),
            provisioning_result=state.get("provisioning_result"),
            workflow_trace=state.get("workflow_trace"),
            error_message=None if state["provisioning_result"].applied else state["provisioning_result"].message,
            reviewed_by=run.reviewed_by,
            reviewed_at=run.reviewed_at,
            review_comment=run.review_comment,
            budget_validated_by=run.budget_validated_by,
            budget_validated_at=run.budget_validated_at,
            budget_validation_comment=run.budget_validation_comment,
        )
        self.audit.record(
            run_id=run_id,
            actor=principal.email,
            action="allocator.run_allocated",
            detail={
                "comment": request.comment,
                "execution_reference": updated.provisioning_result.execution_reference if updated.provisioning_result else None,
            },
        )
        return AllocatorRunResponse(run=updated, tools=state.get("tools", []))

    def list_audit_logs(self) -> AuditLogListResponse:
        return AuditLogListResponse(logs=self.repository.list_audit_logs())

    def _persist_planning_result(self, run: AllocatorRunRecord, actor: str, state: WorkflowState) -> AllocatorRunResponse:
        policy_result = state["policy_result"]
        status = AllocatorRunStatus.AWAITING_APPROVAL if policy_result.passed else AllocatorRunStatus.FAILED
        approval_status = ApprovalStatus.PENDING if policy_result.passed else ApprovalStatus.REJECTED
        budget_validation_status = BudgetValidationStatus.PENDING if policy_result.passed else BudgetValidationStatus.REJECTED
        summary = state.get(
            "summary",
            "Pre-approval planning completed. Waiting for reviewer approval." if policy_result.passed else "Allocator planning failed validation.",
        )
        updated = self.repository.update_run(
            run.id,
            status=status,
            approval_status=approval_status,
            budget_validation_status=budget_validation_status,
            summary=summary,
            account_plan=state.get("account_plan"),
            terraform_bundle=state.get("terraform_bundle"),
            cost_result=state.get("cost_result"),
            policy_result=state.get("policy_result"),
            workflow_trace=state.get("workflow_trace"),
            error_message="; ".join(policy_result.violations) if not policy_result.passed else None,
        )
        self.audit.record(
            run_id=run.id,
            actor=actor,
            action="allocator.awaiting_approval" if policy_result.passed else "allocator.validation_failed",
            detail={"violations": policy_result.violations},
        )
        return AllocatorRunResponse(run=updated, tools=state.get("tools", []))

    def _state_from_run(self, run: AllocatorRunRecord) -> WorkflowState:
        state: WorkflowState = {
            "request": run.payload,
            "workflow_trace": run.workflow_trace,
            "tools": [],
        }
        if run.account_plan is not None:
            state["account_plan"] = run.account_plan
        if run.terraform_bundle is not None:
            state["terraform_bundle"] = run.terraform_bundle
        if run.cost_result is not None:
            state["cost_result"] = run.cost_result
        if run.policy_result is not None:
            state["policy_result"] = run.policy_result
        if run.provisioning_result is not None:
            state["provisioning_result"] = run.provisioning_result
        return state


@lru_cache(maxsize=1)
def get_allocator_control_plane() -> AllocatorControlPlane:
    return AllocatorControlPlane()
