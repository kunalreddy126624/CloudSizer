import unittest

from app.models import CloudProvider, RecommendationRequest
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
    def test_hyperscaler_recommendations_use_catalog_services(self) -> None:
        services = estimate_services(BASE_REQUEST, CloudProvider.AWS)

        self.assertTrue(all(service.service_code for service in services))
        self.assertTrue(all(service.pricing_source.value != "generated" for service in services))

    def test_generated_catalog_providers_fall_back_to_explicit_profiles(self) -> None:
        services = estimate_services(BASE_REQUEST, CloudProvider.ORACLE)

        self.assertTrue(services)
        self.assertTrue(all(service.service_code is None for service in services))
        self.assertTrue(all(service.pricing_source.value == "catalog_snapshot" for service in services))


if __name__ == "__main__":
    unittest.main()
