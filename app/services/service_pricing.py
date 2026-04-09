from app.models import (
    CalculatedDimension,
    CalculatedLineItem,
    ServiceEstimate,
    ServicePricingRequest,
    ServicePricingResponse,
    WorkloadType,
)
from app.services.catalog import get_catalog_service
from app.services.verification import build_accuracy_summary, build_service_accuracy


def calculate_service_pricing(
    request: ServicePricingRequest,
) -> ServicePricingResponse:
    items: list[CalculatedLineItem] = []
    verification_services: list[ServiceEstimate] = []

    for request_item in request.items:
        service = get_catalog_service(request.provider, request_item.service_code)

        dimension_costs: list[CalculatedDimension] = []
        estimated_monthly_cost = service.base_monthly_cost_usd

        for dimension in service.dimensions:
            quantity = request_item.usage.get(dimension.key, dimension.suggested_value)
            cost = round(quantity * dimension.rate_per_unit_usd, 2)
            estimated_monthly_cost += cost
            dimension_costs.append(
                CalculatedDimension(
                    key=dimension.key,
                    label=dimension.label,
                    unit=dimension.unit,
                    quantity=quantity,
                    rate_per_unit_usd=dimension.rate_per_unit_usd,
                    estimated_monthly_cost_usd=cost,
                )
            )

        service_estimate = ServiceEstimate(
            provider=request.provider,
            service_code=service.service_code,
            name=service.name,
            purpose=service.summary,
            estimated_monthly_cost_usd=round(estimated_monthly_cost, 2),
            pricing_source=service.pricing_source,
            last_validated_at=service.last_validated_at,
        )
        service_accuracy = build_service_accuracy(
            request.provider,
            _infer_workload_type(request.items),
            service_estimate,
        )

        items.append(
            CalculatedLineItem(
                service_code=service.service_code,
                service_name=service.name,
                category=service.category,
                region=request_item.region or service.default_region,
                base_monthly_cost_usd=service.base_monthly_cost_usd,
                dimensions=dimension_costs,
                estimated_monthly_cost_usd=round(estimated_monthly_cost, 2),
                pricing_source=service.pricing_source,
                last_validated_at=service.last_validated_at,
                accuracy=service_accuracy,
            )
        )
        verification_services.append(
            service_estimate.model_copy(update={"accuracy": service_accuracy})
        )

    total_cost = round(sum(item.estimated_monthly_cost_usd for item in items), 2)
    return ServicePricingResponse(
        provider=request.provider,
        items=items,
        estimated_monthly_cost_usd=total_cost,
        accuracy=build_accuracy_summary(
            request.provider,
            _infer_workload_type(request.items),
            verification_services,
        ),
    )


def _infer_workload_type(items) -> WorkloadType:
    if any("warehouse" in item.service_code or "bigquery" in item.service_code for item in items):
        return WorkloadType.ANALYTICS
    if any("crm" in item.service_code for item in items):
        return WorkloadType.CRM
    return WorkloadType.APPLICATION
