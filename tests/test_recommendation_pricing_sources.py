import unittest

from app.db import get_connection, init_db
from app.models import CloudProvider, RecommendationRequest
from app.models import PricingSource
from app.services.catalog import get_catalog_service, reload_catalog, upsert_catalog_price_override
from app.services.pricing import estimate_services


BASE_REQUEST = RecommendationRequest.model_validate(
    {
        "workload_type": "application",
        "region": "us-east-1",
        "user_count": 500,
        "concurrent_users": 120,
        "storage_gb": 500,
        "monthly_requests_million": 8,
        "requires_disaster_recovery": False,
        "requires_managed_database": True,
        "availability_tier": "high",
        "budget_preference": "balanced",
        "preferred_providers": ["aws"],
    }
)


class RecommendationPricingSourceTest(unittest.TestCase):
    def setUp(self) -> None:
        init_db()
        with get_connection() as connection:
            connection.execute("DELETE FROM catalog_price_overrides")
        reload_catalog()

    def test_hyperscaler_recommendations_use_catalog_services(self) -> None:
        services = estimate_services(BASE_REQUEST, CloudProvider.AWS)

        self.assertTrue(all(service.service_code for service in services))
        self.assertTrue(all(service.pricing_source.value != "generated" for service in services))

    def test_generated_catalog_providers_fall_back_to_explicit_profiles(self) -> None:
        services = estimate_services(BASE_REQUEST, CloudProvider.ORACLE)

        self.assertTrue(services)
        self.assertTrue(all(service.service_code is None for service in services))
        self.assertTrue(all(service.pricing_source.value == "catalog_snapshot" for service in services))

    def test_generated_catalog_providers_use_benchmark_live_services_after_reference_refresh(self) -> None:
        erp_request = BASE_REQUEST.model_copy(update={"workload_type": "erp"})
        for service_code in ("aws.ecs.fargate", "aws.rds.postgres", "aws.s3.standard"):
            service = get_catalog_service(CloudProvider.AWS, service_code)
            upsert_catalog_price_override(
                provider=CloudProvider.AWS,
                service_code=service.service_code,
                base_monthly_cost_usd=service.base_monthly_cost_usd,
                dimensions=service.dimensions,
                pricing_source=PricingSource.LIVE_API,
            )

        reload_catalog()
        services = estimate_services(erp_request, CloudProvider.ORACLE)

        self.assertTrue(services)
        self.assertTrue(all(service.service_code for service in services))
        self.assertTrue(all(service.pricing_source == PricingSource.BENCHMARK_LIVE for service in services))


if __name__ == "__main__":
    unittest.main()
