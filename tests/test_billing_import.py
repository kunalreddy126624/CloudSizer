import json
import tempfile
import unittest
from pathlib import Path

from app.db import get_connection, init_db
from app.models import BillingImportRequest, CloudProvider, WorkloadType
from app.services.billing_import import import_billing_snapshot


class BillingImportTest(unittest.TestCase):
    def setUp(self) -> None:
        init_db()
        with get_connection() as connection:
            connection.execute("DELETE FROM estimate_actuals")

    def test_imports_generic_json_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            snapshot_path = Path(temp_dir) / "billing.json"
            snapshot_path.write_text(
                json.dumps(
                    [
                        {
                            "provider": "aws",
                            "service_code": "aws.lambda",
                            "service_name": "AWS Lambda",
                            "billing_period_start": "2026-03-01",
                            "billing_period_end": "2026-03-31",
                            "actual_monthly_cost_usd": 125.5,
                            "estimated_monthly_cost_usd": 118.0,
                        }
                    ]
                ),
                encoding="utf-8",
            )

            response = import_billing_snapshot(
                BillingImportRequest(
                    snapshot_path=str(snapshot_path),
                    provider=CloudProvider.AWS,
                    workload_type=WorkloadType.APPLICATION,
                ),
                user_id=1,
            )

        self.assertEqual(response.imported_records, 1)
        self.assertEqual(response.provider_counts["aws"], 1)
        with get_connection() as connection:
            row = connection.execute(
                "SELECT service_code, actual_monthly_cost_usd FROM estimate_actuals"
            ).fetchone()
        self.assertEqual(row["service_code"], "aws.lambda")
        self.assertEqual(row["actual_monthly_cost_usd"], 125.5)


if __name__ == "__main__":
    unittest.main()
