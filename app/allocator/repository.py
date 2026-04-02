import json
from typing import Any

from app.allocator.database import AllocatorDatabase
from app.allocator.schemas import (
    AllocatorRunCreateRequest,
    AllocatorRunRecord,
    AllocatorRunStatus,
    ApprovalStatus,
    AuditLogRecord,
    BudgetValidationStatus,
    CloudAccountPlan,
    ProvisioningResult,
    TerraformBundle,
    WorkflowCostResult,
    WorkflowValidationResult,
    utc_now,
)
from app.models import ResourceAllocatorRequest


class AllocatorRepository:
    def __init__(self, database: AllocatorDatabase) -> None:
        self.database = database
        self.database.init_storage()

    def create_run(self, request: AllocatorRunCreateRequest) -> AllocatorRunRecord:
        created_at = utc_now()
        params = (
            request.requested_by,
            request.change_reason,
            AllocatorRunStatus.DRAFT.value,
            ApprovalStatus.PENDING.value,
            BudgetValidationStatus.PENDING.value,
            "Allocator run submitted.",
            self.database.serialize(request.payload.model_dump(mode="json")),
            created_at,
            created_at,
        )
        with self.database.connection() as connection:
            if self.database.backend == "postgres":
                row = connection.execute(
                    """
                    INSERT INTO allocator_runs (
                        requested_by,
                        change_reason,
                        status,
                        approval_status,
                        budget_validation_status,
                        summary,
                        payload_json,
                        created_at,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    params,
                ).fetchone()
            else:
                cursor = connection.execute(
                    """
                    INSERT INTO allocator_runs (
                        requested_by,
                        change_reason,
                        status,
                        approval_status,
                        budget_validation_status,
                        summary,
                        payload_json,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    params,
                )
                row = connection.execute(
                    "SELECT * FROM allocator_runs WHERE id = ?",
                    (cursor.lastrowid,),
                ).fetchone()
        return self._parse_run_row(row)

    def update_run(
        self,
        run_id: int,
        *,
        status: AllocatorRunStatus,
        approval_status: ApprovalStatus | None = None,
        summary: str,
        account_plan: CloudAccountPlan | None = None,
        terraform_bundle: TerraformBundle | None = None,
        cost_result: WorkflowCostResult | None = None,
        policy_result: WorkflowValidationResult | None = None,
        provisioning_result: ProvisioningResult | None = None,
        workflow_trace: list[str] | None = None,
        error_message: str | None = None,
        reviewed_by: str | None = None,
        reviewed_at: str | None = None,
        review_comment: str | None = None,
        budget_validation_status: BudgetValidationStatus | None = None,
        budget_validated_by: str | None = None,
        budget_validated_at: str | None = None,
        budget_validation_comment: str | None = None,
    ) -> AllocatorRunRecord:
        current = self.get_run(run_id)
        updated_at = utc_now()
        next_approval = approval_status or current.approval_status
        next_budget_validation = budget_validation_status or current.budget_validation_status
        params = (
            status.value,
            next_approval.value,
            next_budget_validation.value,
            summary,
            self._dump_model(account_plan or current.account_plan),
            self._dump_model(terraform_bundle or current.terraform_bundle),
            self._dump_model(cost_result or current.cost_result),
            self._dump_model(policy_result or current.policy_result),
            self._dump_model(provisioning_result or current.provisioning_result),
            self.database.serialize(workflow_trace if workflow_trace is not None else current.workflow_trace),
            error_message,
            reviewed_by if reviewed_by is not None else current.reviewed_by,
            reviewed_at if reviewed_at is not None else current.reviewed_at,
            review_comment if review_comment is not None else current.review_comment,
            budget_validated_by if budget_validated_by is not None else current.budget_validated_by,
            budget_validated_at if budget_validated_at is not None else current.budget_validated_at,
            budget_validation_comment
            if budget_validation_comment is not None
            else current.budget_validation_comment,
            updated_at,
            run_id,
        )
        with self.database.connection() as connection:
            statement = """
                UPDATE allocator_runs
                SET status = {0},
                    approval_status = {0},
                    budget_validation_status = {0},
                    summary = {0},
                    account_plan_json = {0},
                    terraform_bundle_json = {0},
                    cost_result_json = {0},
                    policy_result_json = {0},
                    provisioning_result_json = {0},
                    workflow_trace_json = {0},
                    error_message = {0},
                    reviewed_by = {0},
                    reviewed_at = {0},
                    review_comment = {0},
                    budget_validated_by = {0},
                    budget_validated_at = {0},
                    budget_validation_comment = {0},
                    updated_at = {0}
                WHERE id = {0}
            """.format(self.database.placeholder())
            connection.execute(statement, params)
        return self.get_run(run_id)

    def get_run(self, run_id: int) -> AllocatorRunRecord:
        with self.database.connection() as connection:
            statement = f"SELECT * FROM allocator_runs WHERE id = {self.database.placeholder()}"
            row = connection.execute(statement, (run_id,)).fetchone()
        if row is None:
            raise KeyError(f"Allocator run {run_id} was not found.")
        return self._parse_run_row(row)

    def list_runs(self, *, limit: int = 20) -> list[AllocatorRunRecord]:
        with self.database.connection() as connection:
            if self.database.backend == "postgres":
                rows = connection.execute(
                    "SELECT * FROM allocator_runs ORDER BY id DESC LIMIT %s",
                    (limit,),
                ).fetchall()
            else:
                rows = connection.execute(
                    "SELECT * FROM allocator_runs ORDER BY id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
        return [self._parse_run_row(row) for row in rows]

    def list_pending_approvals(self) -> list[AllocatorRunRecord]:
        with self.database.connection() as connection:
            statement = f"""
                SELECT * FROM allocator_runs
                WHERE approval_status = {self.database.placeholder()}
                  AND status = {self.database.placeholder()}
                ORDER BY id DESC
            """
            rows = connection.execute(
                statement,
                (
                    ApprovalStatus.PENDING.value,
                    AllocatorRunStatus.AWAITING_APPROVAL.value,
                ),
            ).fetchall()
        return [self._parse_run_row(row) for row in rows]

    def add_audit_log(
        self,
        *,
        run_id: int | None,
        actor: str,
        action: str,
        detail: dict[str, Any] | None = None,
    ) -> AuditLogRecord:
        created_at = utc_now()
        params = (
            run_id,
            actor,
            action,
            self.database.serialize(detail or {}),
            created_at,
        )
        with self.database.connection() as connection:
            if self.database.backend == "postgres":
                row = connection.execute(
                    """
                    INSERT INTO allocator_audit_logs (
                        run_id,
                        actor,
                        action,
                        detail_json,
                        created_at
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    params,
                ).fetchone()
            else:
                cursor = connection.execute(
                    """
                    INSERT INTO allocator_audit_logs (
                        run_id,
                        actor,
                        action,
                        detail_json,
                        created_at
                    )
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    params,
                )
                row = connection.execute(
                    "SELECT * FROM allocator_audit_logs WHERE id = ?",
                    (cursor.lastrowid,),
                ).fetchone()
        return self._parse_audit_row(row)

    def list_audit_logs(self, *, limit: int = 50) -> list[AuditLogRecord]:
        with self.database.connection() as connection:
            if self.database.backend == "postgres":
                rows = connection.execute(
                    "SELECT * FROM allocator_audit_logs ORDER BY id DESC LIMIT %s",
                    (limit,),
                ).fetchall()
            else:
                rows = connection.execute(
                    "SELECT * FROM allocator_audit_logs ORDER BY id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
        return [self._parse_audit_row(row) for row in rows]

    def _parse_run_row(self, row: Any) -> AllocatorRunRecord:
        return AllocatorRunRecord(
            id=row["id"],
            requested_by=row["requested_by"],
            change_reason=row["change_reason"],
            status=AllocatorRunStatus(row["status"]),
            approval_status=ApprovalStatus(row["approval_status"]),
            budget_validation_status=BudgetValidationStatus(row["budget_validation_status"]),
            summary=row["summary"],
            payload=ResourceAllocatorRequest.model_validate(self._load_json(row["payload_json"], {})),
            account_plan=self._load_model(row["account_plan_json"], CloudAccountPlan),
            terraform_bundle=self._load_model(row["terraform_bundle_json"], TerraformBundle),
            cost_result=self._load_model(row["cost_result_json"], WorkflowCostResult),
            policy_result=self._load_model(row["policy_result_json"], WorkflowValidationResult),
            provisioning_result=self._load_model(row["provisioning_result_json"], ProvisioningResult),
            workflow_trace=self._load_json(row["workflow_trace_json"], []),
            error_message=row["error_message"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            reviewed_by=row["reviewed_by"],
            reviewed_at=row["reviewed_at"],
            review_comment=row["review_comment"],
            budget_validated_by=row["budget_validated_by"],
            budget_validated_at=row["budget_validated_at"],
            budget_validation_comment=row["budget_validation_comment"],
        )

    def _parse_audit_row(self, row: Any) -> AuditLogRecord:
        return AuditLogRecord(
            id=row["id"],
            run_id=row["run_id"],
            actor=row["actor"],
            action=row["action"],
            detail=self._load_json(row["detail_json"], {}),
            created_at=row["created_at"],
        )

    def _dump_model(self, model: Any) -> str | None:
        if model is None:
            return None
        if hasattr(model, "model_dump"):
            return self.database.serialize(model.model_dump(mode="json"))
        return self.database.serialize(model)

    def _load_model(self, raw: str | None, model_type: Any) -> Any:
        if not raw:
            return None
        return model_type.model_validate(json.loads(raw))

    def _load_json(self, raw: str | None, default: Any) -> Any:
        if not raw:
            return default
        return json.loads(raw)
