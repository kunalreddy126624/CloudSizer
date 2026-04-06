import unittest

from app.db import get_connection, init_db
from app.models import (
    AvailabilityTier,
    BudgetPreference,
    CloudProvider,
    PricingSource,
    RecommendationRequest,
    ServiceEstimate,
    ServicePricingRequest,
    WorkloadType,
)
from app.services.pricing import build_architecture
from app.services.service_pricing import calculate_service_pricing
from app.services.verification import build_accuracy_summary


class EstimateVerificationTest(unittest.TestCase):
    def setUp(self) -> None:
        init_db()
        with get_connection() as connection:
            connection.execute("DELETE FROM estimate_actuals")
            connection.execute(
                """
                INSERT INTO estimate_actuals (
                    user_id,
                    estimate_id,
                    provider,
                    workload_type,
                    service_code,
                    service_name,
                    region,
                    billing_period_start,
                    billing_period_end,
                    estimated_monthly_cost_usd,
                    actual_monthly_cost_usd,
                    notes,
                    observed_usage_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    1,
                    None,
                    CloudProvider.AWS.value,
                    WorkloadType.APPLICATION.value,
                    "aws.lambda",
                    "AWS Lambda",
                    "ap-south-1",
                    "2026-03-01",
                    "2026-03-31",
                    100.0,
                    120.0,
                    "test fixture",
                    "{}",
                ),
            )

    def test_accuracy_summary_uses_actuals_and_live_coverage(self) -> None:
        summary = build_accuracy_summary(
            CloudProvider.AWS,
            WorkloadType.APPLICATION,
            [
                ServiceEstimate(
                    service_code="aws.lambda",
                    name="AWS Lambda",
                    purpose="Compute",
                    estimated_monthly_cost_usd=55.0,
                    pricing_source=PricingSource.LIVE_API,
                ),
                ServiceEstimate(
                    service_code="aws.rds.postgres",
                    name="Amazon RDS PostgreSQL",
                    purpose="Database",
                    estimated_monthly_cost_usd=45.0,
                    pricing_source=PricingSource.CATALOG_SNAPSHOT,
                ),
            ],
        )

        self.assertEqual(summary.compared_actuals_count, 1)
        self.assertAlmostEqual(summary.mean_absolute_percentage_error or 0.0, 16.67, places=2)
        self.assertEqual(summary.live_pricing_coverage_percent, 70.0)
        self.assertGreater(summary.confidence_score, 0.0)

    def test_pricing_response_contains_accuracy_metadata(self) -> None:
        response = calculate_service_pricing(
            ServicePricingRequest.model_validate(
                {
                    "provider": "aws",
                    "items": [
                        {
                            "service_code": "aws.lambda",
                            "region": "ap-south-1",
                            "usage": {
                                "requests_million": 5,
                                "gb_seconds_million": 1.5,
                            },
                        }
                    ],
                }
            )
        )

        self.assertIsNotNone(response.accuracy)
        self.assertEqual(len(response.items), 1)
        self.assertIn(response.items[0].pricing_source.value, {"catalog_snapshot", "live_api"})
        self.assertIsNotNone(response.items[0].accuracy)

    def test_recommendations_include_accuracy(self) -> None:
        recommendation = build_architecture(
            RecommendationRequest(
                workload_type=WorkloadType.APPLICATION,
                region="ap-south-1",
                user_count=120,
                concurrent_users=40,
                storage_gb=500,
                monthly_requests_million=1.2,
                requires_disaster_recovery=False,
                requires_managed_database=True,
                availability_tier=AvailabilityTier.HIGH,
                budget_preference=BudgetPreference.BALANCED,
                preferred_providers=[CloudProvider.AWS],
            ),
            CloudProvider.AWS,
        )

        self.assertIsNotNone(recommendation.accuracy)
        self.assertGreater(len(recommendation.services), 0)
        self.assertTrue(all(service.accuracy is not None for service in recommendation.services))


if __name__ == "__main__":
    unittest.main()
