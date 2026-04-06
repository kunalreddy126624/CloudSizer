import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.noodle.api import router


class NoodleOrchestratorApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.app = FastAPI()
        self.app.include_router(router)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.client.close()

    def test_blueprint_exposes_core_layers(self) -> None:
        response = self.client.get("/noodle/blueprint")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["overview"]["name"], "Noodle Orchestrator")
        self.assertIn("orchestration_stack", payload)
        self.assertIn("metadata_stack", payload)
        self.assertIn("lakehouse_layout", payload)
        self.assertIn("bronze", payload["lakehouse_layout"])

    def test_pipeline_plan_selects_streaming_template_for_realtime_intent(self) -> None:
        response = self.client.post(
            "/noodle/pipelines/plan",
            json={
                "name": "edge-ops-pipeline",
                "business_goal": "Combine edge telemetry and cloud events for real-time operational intelligence.",
                "deployment_scope": "hybrid_multi_cloud",
                "latency_slo": "seconds",
                "requires_ml_features": True,
                "requires_realtime_serving": True,
                "contains_sensitive_data": True,
                "target_consumers": ["bi", "ops_api", "anomaly_model"],
                "sources": [
                    {
                        "name": "edge_sensors",
                        "kind": "iot",
                        "environment": "edge",
                        "format_hint": "protobuf",
                        "change_pattern": "event",
                    },
                    {
                        "name": "erp_work_orders",
                        "kind": "database",
                        "environment": "on_prem",
                        "format_hint": "sqlserver",
                        "change_pattern": "cdc",
                    },
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["workflow_template"], "temporal-event-driven-realtime")
        self.assertGreaterEqual(len(payload["connectors"]), 2)
        self.assertTrue(any(item["name"] == "nl-to-sql" for item in payload["ai_capabilities"]))
        self.assertTrue(any(control["name"] == "dynamic-data-masking" for control in payload["governance_controls"]))

    def test_reference_specs_are_available(self) -> None:
        response = self.client.get("/noodle/reference-specs")

        self.assertEqual(response.status_code, 200)
        specs = response.json()
        self.assertGreaterEqual(len(specs), 2)
        self.assertEqual(specs[0]["id"], "hybrid-orders-analytics")

    def test_microservice_catalog_exposes_planner_and_governance_services(self) -> None:
        response = self.client.get("/noodle/microservices")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        service_names = {service["name"] for service in payload["services"]}
        self.assertIn("noodle-planner", service_names)
        self.assertIn("noodle-governance-service", service_names)
        self.assertIn("noodle-observability-service", service_names)

    def test_workflow_scaffold_start_endpoint_accepts_run(self) -> None:
        response = self.client.post(
            "/noodle/workflows/start",
            json={
                "pipeline_name": "customer-360-pipeline",
                "workflow_template": "temporal-standard-batch-orchestration",
                "trigger": "manual",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["service"], "noodle-workflow-service")
        self.assertEqual(payload["status"], "accepted")
        self.assertEqual(payload["workflow_id"], "wf-customer-360-pipeline-manual")

    def test_governance_scaffold_adds_sensitive_data_controls(self) -> None:
        response = self.client.post(
            "/noodle/governance/evaluate",
            json={
                "asset_name": "customer_360_gold",
                "contains_sensitive_data": True,
                "residency": "eu",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["passed"])
        self.assertIn("dynamic-data-masking", payload["enforced_controls"])
        self.assertIn("residency-and-compliance-routing", payload["enforced_controls"])

    def test_unknown_microservice_returns_not_found(self) -> None:
        response = self.client.get("/noodle/microservices/noodle-missing-service")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Noodle microservice not found.")


if __name__ == "__main__":
    unittest.main()
