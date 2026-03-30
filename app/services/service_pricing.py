from app.models import (
    CalculatedDimension,
    CalculatedLineItem,
    ServicePricingRequest,
    ServicePricingResponse,
)
from app.services.catalog import get_catalog_service


def calculate_service_pricing(
    request: ServicePricingRequest,
) -> ServicePricingResponse:
    items: list[CalculatedLineItem] = []

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

        items.append(
            CalculatedLineItem(
                service_code=service.service_code,
                service_name=service.name,
                category=service.category,
                region=request_item.region or service.default_region,
                base_monthly_cost_usd=service.base_monthly_cost_usd,
                dimensions=dimension_costs,
                estimated_monthly_cost_usd=round(estimated_monthly_cost, 2),
            )
        )

    total_cost = round(sum(item.estimated_monthly_cost_usd for item in items), 2)
    return ServicePricingResponse(
        provider=request.provider,
        items=items,
        estimated_monthly_cost_usd=total_cost,
    )
