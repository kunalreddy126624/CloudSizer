from app.allocator.schemas import CloudAccountPlan, WorkflowCostResult, WorkflowValidationResult
from app.models import ResourceAllocatorRequest


class PolicyValidationService:
    def validate(
        self,
        *,
        request: ResourceAllocatorRequest,
        account_plan: CloudAccountPlan,
        cost_result: WorkflowCostResult,
    ) -> WorkflowValidationResult:
        violations: list[str] = []
        provider = request.approved_estimation.recommended_provider
        required_tags = set(request.organization_context.tagging_policy)
        actual_tags = {
            "project": request.deployment_request.project,
            "env": request.deployment_request.env.value,
            "owner": request.deployment_request.owner,
            **request.deployment_request.additional_tags,
        }
        missing_tags = sorted(tag for tag in required_tags if not actual_tags.get(tag))
        if missing_tags:
            violations.append(f"Missing required tags: {', '.join(missing_tags)}.")

        if provider not in request.organization_context.allowed_clouds:
            violations.append(f"{provider.value} is not in the allowed cloud list.")

        if not request.approved_estimation.approved:
            violations.append("Approved estimation is required before planning can proceed.")

        if not cost_result.within_budget:
            violations.append(
                f"Estimated monthly cost {cost_result.estimated_monthly_cost:.2f} exceeds the budget limit {request.budget_constraints.max_monthly_cost:.2f}."
            )

        if not account_plan.reuse_existing and not request.organization_context.account_vending_enabled:
            violations.append("Account vending is disabled by organization policy.")

        if request.deployment_request.public_ingress_required and request.organization_context.private_network_required:
            violations.append("Private-network-only policy conflicts with requested public ingress.")

        if (
            account_plan.reuse_existing
            and account_plan.existing_account_id
            and request.organization_context.approved_account_ids
            and account_plan.existing_account_id not in request.organization_context.approved_account_ids
        ):
            violations.append("The requested existing cloud account is not approved for allocator use.")

        return WorkflowValidationResult(
            passed=not violations,
            violations=violations,
        )
