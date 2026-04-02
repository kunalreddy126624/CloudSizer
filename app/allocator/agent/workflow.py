from typing import TypedDict

from app.allocator.schemas import (
    CloudAccountPlan,
    ProvisioningResult,
    TerraformBundle,
    ToolExecutionSnapshot,
    WorkflowCostResult,
    WorkflowValidationResult,
)
from app.allocator.services.cloud_accounts import CloudControlPlaneService
from app.allocator.services.costs import CostEstimationService
from app.allocator.services.policies import PolicyValidationService
from app.allocator.services.terraform import TerraformTemplateEngine
from app.models import ResourceAllocatorRequest

try:
    from langgraph.graph import END, StateGraph  # type: ignore
except ModuleNotFoundError:
    END = "__end__"
    StateGraph = None


class WorkflowState(TypedDict, total=False):
    request: ResourceAllocatorRequest
    account_plan: CloudAccountPlan
    terraform_bundle: TerraformBundle
    cost_result: WorkflowCostResult
    policy_result: WorkflowValidationResult
    provisioning_result: ProvisioningResult
    summary: str
    workflow_trace: list[str]
    tools: list[ToolExecutionSnapshot]


class AllocatorWorkflow:
    def __init__(
        self,
        *,
        cloud_control_plane: CloudControlPlaneService,
        terraform_engine: TerraformTemplateEngine,
        cost_service: CostEstimationService,
        policy_service: PolicyValidationService,
    ) -> None:
        self.cloud_control_plane = cloud_control_plane
        self.terraform_engine = terraform_engine
        self.cost_service = cost_service
        self.policy_service = policy_service
        self._graph = self._build_graph()

    def plan(self, request: ResourceAllocatorRequest) -> WorkflowState:
        initial_state: WorkflowState = {
            "request": request,
            "workflow_trace": [],
            "tools": [],
        }
        if self._graph is None:
            state = initial_state
            for node in (
                self._plan_account,
                self._generate_terraform,
                self._estimate_cost,
                self._validate_policy,
            ):
                state = node(state)
            return state
        return self._graph.invoke(initial_state)

    def provision(self, run_id: int, request: ResourceAllocatorRequest, state: WorkflowState) -> WorkflowState:
        working_state = dict(state)
        working_state["request"] = request
        if working_state.get("policy_result") and not working_state["policy_result"].passed:
            return working_state
        updated_state = self._provision_account(working_state)
        return self._apply_terraform(run_id, updated_state)

    def _build_graph(self):
        if StateGraph is None:
            return None
        graph = StateGraph(WorkflowState)
        graph.add_node("plan_account", self._plan_account)
        graph.add_node("generate_terraform", self._generate_terraform)
        graph.add_node("estimate_cost", self._estimate_cost)
        graph.add_node("validate_policy", self._validate_policy)
        graph.set_entry_point("plan_account")
        graph.add_edge("plan_account", "generate_terraform")
        graph.add_edge("generate_terraform", "estimate_cost")
        graph.add_edge("estimate_cost", "validate_policy")
        graph.add_edge("validate_policy", END)
        return graph.compile()

    def _plan_account(self, state: WorkflowState) -> WorkflowState:
        account_plan = self.cloud_control_plane.plan_account(state["request"])
        return self._merge_state(
            state,
            account_plan=account_plan,
            trace=f"Planned {account_plan.provider.value} {account_plan.resource_kind} strategy.",
            tool=ToolExecutionSnapshot(
                name="plan_account",
                status="completed",
                message=account_plan.rationale,
            ),
        )

    def _generate_terraform(self, state: WorkflowState) -> WorkflowState:
        bundle = self.terraform_engine.build_bundle(state["request"])
        return self._merge_state(
            state,
            terraform_bundle=bundle,
            trace=f"Generated Terraform bundle with {len(bundle.files)} files.",
            tool=ToolExecutionSnapshot(
                name="generate_terraform",
                status="completed",
                message=f"Generated {len(bundle.files)} Terraform files.",
            ),
        )

    def _estimate_cost(self, state: WorkflowState) -> WorkflowState:
        cost_result = self.cost_service.estimate(state["request"])
        return self._merge_state(
            state,
            cost_result=cost_result,
            trace=f"Estimated monthly cost at {cost_result.currency} {cost_result.estimated_monthly_cost:.2f}.",
            tool=ToolExecutionSnapshot(
                name="estimate_cost",
                status="completed",
                message=f"Estimated {cost_result.currency} {cost_result.estimated_monthly_cost:.2f}.",
            ),
        )

    def _validate_policy(self, state: WorkflowState) -> WorkflowState:
        result = self.policy_service.validate(
            request=state["request"],
            account_plan=state["account_plan"],
            cost_result=state["cost_result"],
        )
        summary = (
            "Pre-approval planning completed. Waiting for reviewer approval."
            if result.passed
            else "Allocator planning failed validation."
        )
        return self._merge_state(
            state,
            policy_result=result,
            summary=summary,
            trace="Policy validation passed." if result.passed else "; ".join(result.violations),
            tool=ToolExecutionSnapshot(
                name="validate_policy",
                status="completed" if result.passed else "failed",
                message="Policy validation passed." if result.passed else "; ".join(result.violations),
            ),
        )

    def _provision_account(self, state: WorkflowState) -> WorkflowState:
        provisioned_plan = self.cloud_control_plane.provision_account(state["account_plan"])
        if provisioned_plan.reuse_existing:
            return self._merge_state(
                state,
                account_plan=provisioned_plan,
                provisioning_result=ProvisioningResult(
                    applied=False,
                    account_created=False,
                    execution_reference=provisioned_plan.existing_account_id,
                    message="Reusing existing cloud account scope.",
                ),
                trace="Skipped account creation because an existing scope is reused.",
                tool=ToolExecutionSnapshot(
                    name="create_account_scope",
                    status="skipped",
                    message="Existing cloud scope reused.",
                ),
            )
        return self._merge_state(
            state,
            account_plan=provisioned_plan,
            provisioning_result=ProvisioningResult(
                applied=False,
                account_created=True,
                execution_reference=provisioned_plan.provisioning_reference,
                message=f"Provisioned {provisioned_plan.provider.value} {provisioned_plan.resource_kind}.",
            ),
            trace=f"Provisioned {provisioned_plan.provider.value} {provisioned_plan.resource_kind} {provisioned_plan.target_account_id}.",
            tool=ToolExecutionSnapshot(
                name="create_account_scope",
                status="completed",
                message=f"Provisioned {provisioned_plan.provider.value} scope {provisioned_plan.target_account_id}.",
            ),
        )

    def _apply_terraform(self, run_id: int, state: WorkflowState) -> WorkflowState:
        artifact_path = self.terraform_engine.stage_bundle(run_id, state["terraform_bundle"])
        return self._merge_state(
            state,
            provisioning_result=ProvisioningResult(
                applied=True,
                account_created=bool(state.get("provisioning_result") and state["provisioning_result"].account_created),
                terraform_artifact_path=str(artifact_path),
                execution_reference=f"run-{run_id}",
                message=f"Terraform bundle staged at {artifact_path}.",
            ),
            summary="Allocator run approved and staged for provisioning.",
            trace=f"Terraform bundle staged at {artifact_path}.",
            tool=ToolExecutionSnapshot(
                name="apply_terraform",
                status="completed",
                message=f"Terraform bundle staged at {artifact_path}.",
            ),
        )

    def _merge_state(
        self,
        state: WorkflowState,
        *,
        account_plan: CloudAccountPlan | None = None,
        terraform_bundle: TerraformBundle | None = None,
        cost_result: WorkflowCostResult | None = None,
        policy_result: WorkflowValidationResult | None = None,
        provisioning_result: ProvisioningResult | None = None,
        summary: str | None = None,
        trace: str | None = None,
        tool: ToolExecutionSnapshot | None = None,
    ) -> WorkflowState:
        next_state = dict(state)
        if account_plan is not None:
            next_state["account_plan"] = account_plan
        if terraform_bundle is not None:
            next_state["terraform_bundle"] = terraform_bundle
        if cost_result is not None:
            next_state["cost_result"] = cost_result
        if policy_result is not None:
            next_state["policy_result"] = policy_result
        if provisioning_result is not None:
            next_state["provisioning_result"] = provisioning_result
        if summary is not None:
            next_state["summary"] = summary
        if trace is not None:
            next_state["workflow_trace"] = [*next_state.get("workflow_trace", []), trace]
        if tool is not None:
            next_state["tools"] = [*next_state.get("tools", []), tool]
        return next_state
