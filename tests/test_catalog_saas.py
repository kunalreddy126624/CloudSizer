import unittest

from app.models import CloudProvider, ServiceCategory
from app.services.catalog import get_catalog_services, reload_catalog


class CatalogSaasTest(unittest.TestCase):
    def setUp(self) -> None:
        reload_catalog()

    def test_snowflake_and_salesforce_are_available_across_all_clouds(self) -> None:
        services = get_catalog_services(category=ServiceCategory.SAAS)
        by_provider = {provider: [] for provider in CloudProvider}
        for service in services:
            by_provider[service.provider].append(service.service_family)

        for provider in CloudProvider:
            self.assertIn("snowflake_warehouse", by_provider[provider], provider.value)
            self.assertIn("salesforce_crm", by_provider[provider], provider.value)


if __name__ == "__main__":
    unittest.main()
