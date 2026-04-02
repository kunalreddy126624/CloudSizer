from app.allocator.config import AllocatorSettings
from app.allocator.schemas import WorkflowCostResult
from app.models import ResourceAllocatorRequest


class CostEstimationService:
    def __init__(self, settings: AllocatorSettings) -> None:
        self.settings = settings

    def estimate(self, request: ResourceAllocatorRequest) -> WorkflowCostResult:
        approved_total = round(request.approved_estimation.estimated_monthly_cost_usd or 0.0, 2)
        service_total = round(
            sum(service.estimated_monthly_cost_usd for service in request.approved_estimation.approved_services),
            2,
        )
        scaled_total = max(approved_total, service_total)
        if request.approved_estimation.baseline_request.requires_disaster_recovery:
            scaled_total *= 1.15
        if request.deployment_request.env.value == "prod":
            scaled_total *= 1.08
        estimated = round(scaled_total, 2)
        line_items = [
            {
                "name": service.name,
                "service_code": service.service_code,
                "estimated_monthly_cost_usd": service.estimated_monthly_cost_usd,
            }
            for service in request.approved_estimation.approved_services
        ]
        if not line_items:
            line_items.append(
                {
                    "name": "approved_estimate",
                    "service_code": "approved-estimate",
                    "estimated_monthly_cost_usd": estimated,
                }
            )
        return WorkflowCostResult(
            currency=request.budget_constraints.currency or self.settings.default_currency,
            estimated_monthly_cost=estimated,
            within_budget=estimated <= request.budget_constraints.max_monthly_cost,
            line_items=line_items,
        )
