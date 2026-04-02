import importlib
import os
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


class AllocatorAuthorizationApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_env = {
            "RBAC_DATABASE_URL": os.getenv("RBAC_DATABASE_URL"),
            "RBAC_JWT_SECRET": os.getenv("RBAC_JWT_SECRET"),
            "ALLOCATOR_DATABASE_URL": os.getenv("ALLOCATOR_DATABASE_URL"),
            "ALLOCATOR_TERRAFORM_ARTIFACT_DIR": os.getenv("ALLOCATOR_TERRAFORM_ARTIFACT_DIR"),
            "ALLOCATOR_MOCK_CLOUD_CONTROL_PLANE": os.getenv("ALLOCATOR_MOCK_CLOUD_CONTROL_PLANE"),
        }
        os.environ["RBAC_DATABASE_URL"] = f"sqlite:///{Path(self.temp_dir.name) / 'rbac-test.db'}"
        os.environ["RBAC_JWT_SECRET"] = "rbac-test-secret-for-unit-tests-32bytes"
        os.environ["ALLOCATOR_DATABASE_URL"] = f"sqlite:///{Path(self.temp_dir.name) / 'allocator-test.db'}"
        os.environ["ALLOCATOR_TERRAFORM_ARTIFACT_DIR"] = str(Path(self.temp_dir.name) / "artifacts")
        os.environ["ALLOCATOR_MOCK_CLOUD_CONTROL_PLANE"] = "true"

        import app.allocator.control_plane as allocator_control_plane_module
        import app.allocator.api as allocator_api_module
        import app.rbac.service as rbac_service_module
        import app.rbac.api as rbac_api_module
        import app.rbac.middleware as rbac_middleware_module

        importlib.reload(allocator_control_plane_module)
        importlib.reload(allocator_api_module)
        importlib.reload(rbac_service_module)
        importlib.reload(rbac_api_module)
        importlib.reload(rbac_middleware_module)

        self.allocator_control_plane_module = allocator_control_plane_module
        self.allocator_api_module = allocator_api_module
        self.rbac_service_module = rbac_service_module
        self.rbac_api_module = rbac_api_module
        self.rbac_middleware_module = rbac_middleware_module

        self.allocator_control_plane_module.get_allocator_control_plane.cache_clear()
        self.rbac_service_module.get_rbac_service.cache_clear()
        self.rbac_service = self.rbac_service_module.get_rbac_service()
        self.rbac_service.init_database()
        self.allocator_control_plane_module.get_allocator_control_plane()

        self.app = FastAPI()
        self.app.add_middleware(self.rbac_middleware_module.AuditLoggingMiddleware)
        self.app.add_middleware(self.rbac_middleware_module.RbacContextMiddleware)
        self.app.include_router(self.allocator_api_module.router)
        self.app.include_router(self.rbac_api_module.router)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.client.close()
        self.rbac_service.session_factory.kw["bind"].dispose()
        self.allocator_control_plane_module.get_allocator_control_plane.cache_clear()
        self.rbac_service_module.get_rbac_service.cache_clear()
        for key, value in self.original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.temp_dir.cleanup()

    def test_allocate_requires_approval_budget_validation_and_operator_role(self) -> None:
        admin_token = self._login("admin@cloudsizer.local", "CloudSizer123!")
        self._create_user(admin_token, "architect@example.com", "architect")
        self._create_user(admin_token, "approver@example.com", "approver")
        self._create_user(admin_token, "finops@example.com", "finops")
        self._create_user(admin_token, "operator@example.com", "operator")

        architect_token = self._login("architect@example.com", "CloudSizer123!")
        approver_token = self._login("approver@example.com", "CloudSizer123!")
        finops_token = self._login("finops@example.com", "CloudSizer123!")
        operator_token = self._login("operator@example.com", "CloudSizer123!")

        create_response = self.client.post(
            "/allocator/runs",
            headers=self._auth(architect_token),
            json=self._allocator_run_payload("cloudflare"),
        )
        self.assertEqual(create_response.status_code, 200)
        run_id = create_response.json()["run"]["id"]

        early_allocate = self.client.post(
            f"/allocator/runs/{run_id}/allocate",
            headers=self._auth(operator_token),
            json={"operator": "operator@example.com", "comment": "run apply"},
        )
        self.assertEqual(early_allocate.status_code, 409)
        self.assertIn("approved", early_allocate.json()["detail"].lower())

        approve_response = self.client.post(
            f"/allocator/approvals/{run_id}/approve",
            headers=self._auth(approver_token),
            json={"reviewer": "approver@example.com", "comment": "approved"},
        )
        self.assertEqual(approve_response.status_code, 200)
        self.assertEqual(approve_response.json()["run"]["status"], "approved")
        self.assertIsNone(approve_response.json()["run"]["provisioning_result"])

        blocked_without_finops = self.client.post(
            f"/allocator/runs/{run_id}/allocate",
            headers=self._auth(operator_token),
            json={"operator": "operator@example.com", "comment": "run apply"},
        )
        self.assertEqual(blocked_without_finops.status_code, 409)
        self.assertIn("budget-validated", blocked_without_finops.json()["detail"].lower())

        budget_response = self.client.post(
            f"/allocator/runs/{run_id}/budget-validation",
            headers=self._auth(finops_token),
            json={"reviewer": "finops@example.com", "comment": "budget approved"},
        )
        self.assertEqual(budget_response.status_code, 200)
        self.assertEqual(budget_response.json()["run"]["budget_validation_status"], "approved")

        allocate_response = self.client.post(
            f"/allocator/runs/{run_id}/allocate",
            headers=self._auth(operator_token),
            json={"operator": "operator@example.com", "comment": "run apply"},
        )
        self.assertEqual(allocate_response.status_code, 200)
        self.assertEqual(allocate_response.json()["run"]["status"], "completed")
        self.assertTrue(allocate_response.json()["run"]["provisioning_result"]["applied"])

        audit_response = self.client.get(
            "/rbac/audit-logs",
            headers=self._auth(admin_token),
        )
        self.assertEqual(audit_response.status_code, 200)
        approval_log = next(item for item in audit_response.json()["items"] if item["action"] == "approve_request" and item["resource_id"] == str(run_id))
        allocation_log = next(item for item in audit_response.json()["items"] if item["action"] == "allocate_resources" and item["resource_id"] == str(run_id))
        self.assertEqual(approval_log["metadata"]["approved_by"], "approver@example.com")
        self.assertEqual(approval_log["resource_type"], "allocator_run")
        self.assertEqual(allocation_log["metadata"]["triggered_by"], "operator@example.com")
        self.assertTrue(allocation_log["metadata"]["provisioning_applied"])

    def test_allocate_alias_uses_same_authorization_gate(self) -> None:
        admin_token = self._login("admin@cloudsizer.local", "CloudSizer123!")
        self._create_user(admin_token, "architect@example.com", "architect")
        self._create_user(admin_token, "approver@example.com", "approver")
        self._create_user(admin_token, "finops@example.com", "finops")
        self._create_user(admin_token, "operator@example.com", "operator")

        architect_token = self._login("architect@example.com", "CloudSizer123!")
        approver_token = self._login("approver@example.com", "CloudSizer123!")
        finops_token = self._login("finops@example.com", "CloudSizer123!")
        operator_token = self._login("operator@example.com", "CloudSizer123!")

        create_response = self.client.post(
            "/allocator/runs",
            headers=self._auth(architect_token),
            json=self._allocator_run_payload("aws"),
        )
        self.assertEqual(create_response.status_code, 200)
        run_id = create_response.json()["run"]["id"]

        blocked_before_approval = self.client.post(
            f"/allocator/allocate/{run_id}",
            headers=self._auth(operator_token),
            json={"operator": "operator@example.com", "comment": "run apply"},
        )
        self.assertEqual(blocked_before_approval.status_code, 409)
        self.assertIn("approved", blocked_before_approval.json()["detail"].lower())

        self.client.post(
            f"/allocator/approvals/{run_id}/approve",
            headers=self._auth(approver_token),
            json={"reviewer": "approver@example.com", "comment": "approved"},
        )
        self.client.post(
            f"/allocator/runs/{run_id}/budget-validation",
            headers=self._auth(finops_token),
            json={"reviewer": "finops@example.com", "comment": "budget approved"},
        )

        allocate_response = self.client.post(
            f"/allocator/allocate/{run_id}",
            headers=self._auth(operator_token),
            json={"operator": "operator@example.com", "comment": "run apply"},
        )
        self.assertEqual(allocate_response.status_code, 200)
        self.assertEqual(allocate_response.json()["run"]["status"], "completed")

    def test_requester_cannot_self_approve_via_api(self) -> None:
        admin_token = self._login("admin@cloudsizer.local", "CloudSizer123!")
        architect_user_id = self._create_user(admin_token, "architect@example.com", "architect")
        self._create_user(admin_token, "architect.approver@example.com", "approver")

        architect_token = self._login("architect@example.com", "CloudSizer123!")
        approver_token = self._login("architect.approver@example.com", "CloudSizer123!")

        create_response = self.client.post(
            "/allocator/runs",
            headers=self._auth(architect_token),
            json=self._allocator_run_payload("azure"),
        )
        self.assertEqual(create_response.status_code, 200)
        run_id = create_response.json()["run"]["id"]

        role_assign_response = self.client.post(
            f"/rbac/users/{architect_user_id}/roles",
            headers=self._auth(admin_token),
            json={"roles": ["architect", "approver"]},
        )
        self.assertEqual(role_assign_response.status_code, 200)
        combined_token = self._login("architect@example.com", "CloudSizer123!")
        blocked_response = self.client.post(
            f"/allocator/approvals/{run_id}/approve",
            headers=self._auth(combined_token),
            json={"reviewer": "architect@example.com", "comment": "self approve"},
        )
        self.assertEqual(blocked_response.status_code, 403)
        self.assertIn("cannot approve", blocked_response.json()["detail"].lower())

        allowed_response = self.client.post(
            f"/allocator/approvals/{run_id}/approve",
            headers=self._auth(approver_token),
            json={"reviewer": "architect.approver@example.com", "comment": "reviewed"},
        )
        self.assertEqual(allowed_response.status_code, 200)

    def _create_user(self, admin_token: str, email: str, role: str) -> int:
        response = self.client.post(
            "/rbac/users",
            headers=self._auth(admin_token),
            json={
                "email": email,
                "full_name": email.split("@")[0].title(),
                "password": "CloudSizer123!",
                "roles": [role],
            },
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["id"]

    def _login(self, email: str, password: str) -> str:
        response = self.client.post("/rbac/auth/login", json={"email": email, "password": password})
        self.assertEqual(response.status_code, 200)
        return response.json()["access_token"]

    def _auth(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def _allocator_run_payload(self, provider: str) -> dict:
        return {
            "requested_by": "architect@example.com",
            "change_reason": "Validate secured allocator flow.",
            "payload": {
                "approved_estimation": {
                    "approval_reference": "APR-9001",
                    "approved": True,
                    "baseline_request": {
                        "workload_type": "application",
                        "region": "us-east-1",
                        "user_count": 200,
                        "concurrent_users": 50,
                        "storage_gb": 300,
                        "monthly_requests_million": 2,
                        "requires_disaster_recovery": False,
                        "requires_managed_database": True,
                        "availability_tier": "high",
                        "budget_preference": "balanced",
                        "preferred_providers": ["aws", "azure", "gcp"],
                    },
                    "recommended_provider": provider,
                    "estimated_monthly_cost_usd": 500,
                    "approved_services": [],
                    "notes": [],
                },
                "budget_constraints": {"currency": "USD", "max_monthly_cost": 1200},
                "architecture_type": "web_application",
                "organization_context": {
                    "allowed_clouds": [
                        "aws",
                        "azure",
                        "gcp",
                        "oracle",
                        "alibaba",
                        "ibm",
                        "tencent",
                        "digitalocean",
                        "akamai",
                        "ovhcloud",
                        "cloudflare",
                    ],
                    "approved_account_ids": ["shared-platform"],
                    "billing_scope": "finops-core",
                    "account_vending_enabled": True,
                    "default_parent_org_unit": "platform",
                    "tagging_policy": ["project", "env", "owner"],
                    "iam_boundary_name": "cloudsizer-boundary",
                    "private_network_required": False,
                    "network_guardrails": ["central-logging"],
                    "terraform_runner_enabled": True,
                    "terraform_artifact_root": "",
                },
                "deployment_request": {
                    "env": "staging",
                    "region": "us-east-1",
                    "owner": "platform-team",
                    "project": "allocator-test",
                    "public_ingress_required": False,
                    "approval_to_apply": False,
                    "requires_new_account": True,
                    "account_name": f"allocator-{provider}",
                    "account_purpose": "test workload",
                    "parent_org_unit": "platform",
                    "additional_tags": {"cost_center": "engineering"},
                },
            },
        }


if __name__ == "__main__":
    unittest.main()
