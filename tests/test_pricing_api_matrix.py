import unittest

from app.api.routes import calculate_pricing, list_catalog_services
from app.models import CloudProvider, ServiceCategory, ServicePricingRequest


class PricingApiMatrixTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.providers = [provider.value for provider in CloudProvider]
        cls.categories = [category.value for category in ServiceCategory]

    def test_catalog_services_exist_for_each_provider_category_pair(self) -> None:
        for provider in self.providers:
            for category in self.categories:
                with self.subTest(provider=provider, category=category):
                    services = list_catalog_services(
                        provider=CloudProvider(provider),
                        category=ServiceCategory(category),
                    )
                    self.assertGreater(
                        len(services),
                        0,
                        msg=f"no services returned for {provider}/{category}",
                    )

    def test_pricing_calculates_for_each_provider_category_pair(self) -> None:
        for provider in self.providers:
            for category in self.categories:
                with self.subTest(provider=provider, category=category):
                    services = list_catalog_services(
                        provider=CloudProvider(provider),
                        category=ServiceCategory(category),
                    )
                    service = services[0]
                    usage = {
                        dimension.key: dimension.suggested_value for dimension in service.dimensions
                    }

                    payload = calculate_pricing(
                        ServicePricingRequest.model_validate(
                            {
                            "provider": provider,
                            "items": [
                                {
                                    "service_code": service.service_code,
                                    "region": service.default_region,
                                    "usage": usage,
                                }
                            ],
                            }
                        )
                    )
                    self.assertEqual(payload.provider.value, provider)
                    self.assertEqual(len(payload.items), 1)
                    self.assertEqual(payload.items[0].service_code, service.service_code)
                    self.assertGreaterEqual(payload.estimated_monthly_cost_usd, 0)


if __name__ == "__main__":
    unittest.main()
