import unittest

from app.agents.live_price_verification import verify_live_prices
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

    def test_hyperscaler_recommendations_fall_back_when_live_prices_are_not_verified(self) -> None:
        services = estimate_services(BASE_REQUEST, CloudProvider.AWS)

        self.assertTrue(services)
        self.assertTrue(all(service.service_code is None for service in services))

    def test_generated_catalog_providers_fall_back_to_explicit_profiles(self) -> None:
        services = estimate_services(BASE_REQUEST, CloudProvider.ORACLE)

        self.assertTrue(services)
        self.assertTrue(all(service.service_code is None for service in services))
        self.assertTrue(all(service.pricing_source.value == "catalog_snapshot" for service in services))

    def test_verified_live_prices_are_used_for_estimation(self) -> None:
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

        verify_live_prices(CloudProvider.AWS)
        reload_catalog()
        services = estimate_services(erp_request, CloudProvider.AWS)

        self.assertTrue(services)
        self.assertTrue(all(service.service_code for service in services))
        self.assertTrue(all(service.pricing_source == PricingSource.LIVE_API for service in services))
        self.assertTrue(all(service.verified_live_price for service in services))

    def test_decoupled_compute_respects_selective_provider_overrides(self) -> None:
        decoupled_request = BASE_REQUEST.model_copy(
            update={
                "enable_decoupled_compute": True,
                "selective_services": [
                    {"service_family": "compute", "provider": "aws"},
                    {"service_family": "database", "provider": "azure"},
                    {"service_family": "edge", "provider": "gcp"},
                ],
                "preferred_providers": ["aws", "azure", "gcp"],
            }
        )

        services = estimate_services(decoupled_request, CloudProvider.AWS)
        providers = {service.provider for service in services if service.provider is not None}

        self.assertIn(CloudProvider.AWS, providers)
        self.assertIn(CloudProvider.AZURE, providers)
        self.assertIn(CloudProvider.GCP, providers)
        self.assertTrue(
            any("cross-cloud control plane" in service.name.lower() for service in services)
        )


if __name__ == "__main__":
    unittest.main()
