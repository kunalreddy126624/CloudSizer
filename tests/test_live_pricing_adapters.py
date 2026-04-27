import unittest

from app.db import get_connection, init_db
from app.agents.live_price_verification import verify_live_prices
from app.models import CloudProvider, PricingSource
from app.services.catalog import get_catalog_service, get_catalog_services, reload_catalog
from app.services.live_pricing import (
    _extract_first_numeric,
    _persist_scaled_live_price_override,
    _select_lowest_monthly_price,
    _select_shape_based_monthly_price,
)


class LivePricingAdapterHelpersTest(unittest.TestCase):
    def setUp(self) -> None:
        init_db()
        with get_connection() as connection:
            connection.execute("DELETE FROM catalog_price_overrides")
        reload_catalog()

    def test_shape_selector_chooses_closest_plan(self) -> None:
        monthly_price = _select_shape_based_monthly_price(
            [
                {"slug": "small", "vcpus": 1, "memory": 2048, "price_monthly": 12},
                {"slug": "target", "vcpus": 2, "memory": 4096, "price_monthly": 24},
                {"slug": "large", "vcpus": 4, "memory": 8192, "price_monthly": 48},
            ],
            target_vcpus=2,
            target_memory_gb=4,
            monthly_field_path=("price_monthly",),
        )

        self.assertEqual(monthly_price, 24.0)

    def test_lowest_price_selector_uses_nested_monthly_field(self) -> None:
        monthly_price = _select_lowest_monthly_price(
            [
                {"id": "a", "price": {"monthly": 30}},
                {"id": "b", "price": {"monthly": 20}},
                {"id": "c", "price": {"monthly": 25}},
            ],
            monthly_field_path=("price", "monthly"),
        )

        self.assertEqual(monthly_price, 20.0)

    def test_extract_first_numeric_returns_first_match(self) -> None:
        value = _extract_first_numeric(
            {"Response": {"Price": {"OriginalUnitPrice": "0.42"}}},
            [
                ("Response", "Price", "UnitPrice"),
                ("Response", "Price", "OriginalUnitPrice"),
            ],
        )

        self.assertEqual(value, 0.42)

    def test_scaled_live_override_marks_generated_provider_service_as_live_api(self) -> None:
        service = next(
            item
            for item in get_catalog_services(provider=CloudProvider.DIGITALOCEAN)
            if item.service_code == "digitalocean.virtual_machine"
        )
        original_monthly_cost = service.base_monthly_cost_usd + sum(
            dimension.suggested_value * dimension.rate_per_unit_usd for dimension in service.dimensions
        )

        _persist_scaled_live_price_override(service, original_monthly_cost * 1.5)
        reload_catalog()

        refreshed = get_catalog_service(CloudProvider.DIGITALOCEAN, "digitalocean.virtual_machine")
        refreshed_monthly_cost = refreshed.base_monthly_cost_usd + sum(
            dimension.suggested_value * dimension.rate_per_unit_usd for dimension in refreshed.dimensions
        )

        self.assertEqual(refreshed.pricing_source, PricingSource.LIVE_API)
        self.assertGreater(refreshed_monthly_cost, original_monthly_cost)
        self.assertFalse(refreshed.verified_live_price)

    def test_live_price_verification_marks_cross_checked_live_service(self) -> None:
        service = get_catalog_service(CloudProvider.DIGITALOCEAN, "digitalocean.virtual_machine")
        original_monthly_cost = service.base_monthly_cost_usd + sum(
            dimension.suggested_value * dimension.rate_per_unit_usd for dimension in service.dimensions
        )

        _persist_scaled_live_price_override(service, original_monthly_cost * 1.1)
        verification = verify_live_prices(CloudProvider.DIGITALOCEAN)
        reload_catalog()

        refreshed = get_catalog_service(CloudProvider.DIGITALOCEAN, "digitalocean.virtual_machine")

        self.assertEqual(verification.verified_services, 1)
        self.assertTrue(refreshed.verified_live_price)


if __name__ == "__main__":
    unittest.main()
