import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.noodle import noodle_router


class NoodleRagApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.app = FastAPI()
        self.app.include_router(noodle_router)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.client.close()

    def test_rag_query_returns_relevant_reference_sources(self) -> None:
        response = self.client.post(
            "/noodle/rag/query",
            json={"query": "Which pipeline covers GitHub repository activity and pull request flow?", "max_results": 2},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["retrieval_backend"], "in-memory-keyword-index")
        self.assertGreaterEqual(len(payload["sources"]), 1)
        self.assertIn("GitHub Engineering Intelligence", payload["answer"])
        self.assertEqual(payload["sources"][0]["kind"], "reference_spec")

    def test_rag_query_returns_microservice_match_for_workflow_question(self) -> None:
        response = self.client.post(
            "/noodle/rag/query",
            json={"query": "Which service starts workflow execution and coordinates workers?", "max_results": 3},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        source_ids = {item["id"] for item in payload["sources"]}
        self.assertIn("noodle-workflow-service", source_ids)

    def test_rag_query_rejects_too_short_queries(self) -> None:
        response = self.client.post("/noodle/rag/query", json={"query": "rag"})

        self.assertEqual(response.status_code, 422)

    def test_rag_query_can_use_architecture_system_design_context(self) -> None:
        response = self.client.post(
            "/noodle/rag/query",
            json={
                "query": "How should the control plane and execution plane be separated for this architecture?",
                "architecture_context": {
                    "name": "Retail Lakehouse Architect",
                    "prompt": "Design a resilient retail lakehouse platform.",
                    "summary": "Multi-region platform for retail analytics and operational APIs.",
                    "system_design": "Control plane handles authoring, scheduling, metadata, and auth. Execution plane runs workers, stream processors, and retries.",
                    "selected_providers": ["aws", "gcp"],
                    "components": ["api gateway", "scheduler", "metadata catalog", "workers"],
                    "cloud_services": ["eks", "msk", "bigquery"],
                    "data_flow": ["sources", "bronze", "silver", "gold", "serving"],
                    "scaling_strategy": ["scale workers independently", "partition streaming jobs"],
                    "security_considerations": ["mask PII", "regional residency"],
                    "assumptions": ["shared metadata plane"]
                }
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        source_kinds = {item["kind"] for item in payload["sources"]}
        self.assertIn("system_design", source_kinds)

    def test_agent_query_self_heals_using_context(self) -> None:
        response = self.client.post(
            "/noodle/agents/query",
            json={
                "agent": "architect",
                "user_turn": "zzplane zzworkers split guidance",
                "context_blocks": ["Need control-plane authoring and worker execution separation."],
                "architecture_context": {
                    "name": "Retail Lakehouse Architect",
                    "prompt": "Design a resilient retail lakehouse platform.",
                    "summary": "Multi-region platform for retail analytics and operational APIs.",
                    "system_design": "Control plane handles authoring, scheduling, metadata, and auth. Execution plane runs workers, stream processors, and retries.",
                    "selected_providers": ["aws", "gcp"],
                    "components": ["api gateway", "scheduler", "metadata catalog", "workers"],
                    "cloud_services": ["eks", "msk", "bigquery"],
                    "data_flow": ["sources", "bronze", "silver", "gold", "serving"],
                    "scaling_strategy": ["scale workers independently", "partition streaming jobs"],
                    "security_considerations": ["mask PII", "regional residency"],
                    "assumptions": ["shared metadata plane"]
                }
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["assistant"], "agent-architect")
        self.assertTrue(payload["recovered"])
        self.assertGreaterEqual(len(payload["attempted_queries"]), 2)
        self.assertIn("System design anchor", payload["answer"])

    def test_agent_momo_query_returns_designer_guidance(self) -> None:
        response = self.client.post(
            "/noodle/designer/momo/query",
            json={
                "user_turn": "How should I model retries and separation between control plane and workers for this design?",
                "architecture_context": {
                    "name": "Retail Lakehouse Architect",
                    "prompt": "Design a resilient retail lakehouse platform.",
                    "summary": "Multi-region platform for retail analytics and operational APIs.",
                    "system_design": "Control plane handles authoring, scheduling, metadata, and auth. Execution plane runs workers, stream processors, and retries.",
                    "selected_providers": ["aws"],
                    "components": ["api gateway", "scheduler", "workers"],
                    "cloud_services": ["eks", "msk"],
                    "data_flow": ["sources", "bronze", "silver", "serving"],
                    "scaling_strategy": ["scale workers independently"],
                    "security_considerations": ["mask PII"],
                    "assumptions": ["scheduler remains stateless"]
                },
                "intent": {
                    "name": "retail-ops-pipeline",
                    "business_goal": "Create a resilient retail operations pipeline with fast serving and governed execution.",
                    "deployment_scope": "multi_cloud",
                    "latency_slo": "minutes",
                    "requires_ml_features": False,
                    "requires_realtime_serving": True,
                    "contains_sensitive_data": True,
                    "target_consumers": ["ops_api", "bi"],
                    "sources": [
                        {
                            "name": "orders_api",
                            "kind": "api",
                            "environment": "aws",
                            "format_hint": "json",
                            "change_pattern": "append"
                        }
                    ]
                },
                "pipeline_document": {
                    "id": "pipe-1",
                    "name": "retail-ops",
                    "status": "draft",
                    "version": 1,
                    "nodes": [
                        {
                            "id": "source-1",
                            "label": "Orders API",
                            "kind": "source",
                            "position": {"x": 10, "y": 20},
                            "params": []
                        },
                        {
                            "id": "serve-1",
                            "label": "Ops Serving",
                            "kind": "serve",
                            "position": {"x": 100, "y": 20},
                            "params": []
                        }
                    ],
                    "edges": [{"id": "edge-1", "source": "source-1", "target": "serve-1"}],
                    "connection_refs": [],
                    "metadata_assets": [],
                    "schemas": [],
                    "transformations": [],
                    "deployment": {
                        "enabled": False,
                        "deploy_target": "local_docker",
                        "repository": {
                            "provider": "github",
                            "connection_id": None,
                            "repository": "",
                            "branch": "main",
                            "backend_path": "app",
                            "workflow_ref": ".github/workflows/deploy.yml"
                        },
                        "build_command": "docker build -t noodle-pipeline-backend .",
                        "deploy_command": "docker compose up -d --build",
                        "artifact_name": "noodle-pipeline-backend",
                        "notes": ""
                    },
                    "orchestrator_plan": None,
                    "schedule": {
                        "trigger": "manual",
                        "cron": "",
                        "timezone": "UTC",
                        "enabled": False,
                        "concurrency_policy": "forbid",
                        "orchestration_mode": "tasks",
                        "if_condition": ""
                    },
                    "batch_sessions": [],
                    "runs": [],
                    "saved_at": "2026-04-21T00:00:00Z"
                }
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["assistant"], "agent-momo")
        self.assertIn("System design anchor", payload["answer"])
        self.assertGreaterEqual(len(payload["sources"]), 1)
        self.assertIn("recovered", payload)


if __name__ == "__main__":
    unittest.main()
