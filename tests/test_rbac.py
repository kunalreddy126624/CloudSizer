import importlib
import os
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


class RbacApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_env = {
            "RBAC_DATABASE_URL": os.getenv("RBAC_DATABASE_URL"),
            "RBAC_JWT_SECRET": os.getenv("RBAC_JWT_SECRET"),
        }
        os.environ["RBAC_DATABASE_URL"] = f"sqlite:///{Path(self.temp_dir.name) / 'rbac-test.db'}"
        os.environ["RBAC_JWT_SECRET"] = "rbac-test-secret-for-unit-tests-32bytes"

        import app.rbac.service as service_module
        import app.rbac.api as api_module
        import app.rbac.middleware as middleware_module

        importlib.reload(service_module)
        importlib.reload(api_module)
        importlib.reload(middleware_module)

        self.service_module = service_module
        self.api_module = api_module
        self.middleware_module = middleware_module
        self.service_module.get_rbac_service.cache_clear()
        self.service = self.service_module.get_rbac_service()
        self.service.init_database()

        self.app = FastAPI()
        self.app.add_middleware(self.middleware_module.AuditLoggingMiddleware)
        self.app.add_middleware(self.middleware_module.RbacContextMiddleware)
        self.app.include_router(self.api_module.router)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.client.close()
        engine = self.service.session_factory.kw["bind"]
        engine.dispose()
        self.service_module.get_rbac_service.cache_clear()
        for key, value in self.original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.temp_dir.cleanup()

    def test_admin_can_create_user_and_assign_architect_role(self) -> None:
        admin_token = self._login("admin@cloudsizer.local", "CloudSizer123!")

        create_response = self.client.post(
            "/rbac/users",
            headers=self._auth(admin_token),
            json={
                "email": "architect@example.com",
                "full_name": "Cloud Architect",
                "password": "CloudSizer123!",
                "roles": ["architect"],
            },
        )
        self.assertEqual(create_response.status_code, 200)
        user_id = create_response.json()["id"]

        assign_response = self.client.post(
            f"/rbac/users/{user_id}/roles",
            headers=self._auth(admin_token),
            json={"roles": ["architect", "viewer"]},
        )
        self.assertEqual(assign_response.status_code, 200)
        self.assertEqual(
            {item["name"] for item in assign_response.json()["roles"]},
            {"architect", "viewer"},
        )
        logs_response = self.client.get(
            "/rbac/audit-logs?action=manage_user_roles",
            headers=self._auth(admin_token),
        )
        self.assertEqual(logs_response.status_code, 200)
        self.assertEqual(logs_response.json()["items"][0]["resource_id"], str(user_id))
        self.assertEqual(logs_response.json()["items"][0]["metadata"]["roles"], ["architect", "viewer"])

    def test_viewer_is_denied_create_estimation(self) -> None:
        admin_token = self._login("admin@cloudsizer.local", "CloudSizer123!")
        self.client.post(
            "/rbac/users",
            headers=self._auth(admin_token),
            json={
                "email": "viewer@example.com",
                "full_name": "Read Only",
                "password": "CloudSizer123!",
                "roles": ["viewer"],
            },
        )
        viewer_token = self._login("viewer@example.com", "CloudSizer123!")

        response = self.client.post(
            "/rbac/estimations",
            headers=self._auth(viewer_token),
            json={
                "title": "ERP sizing",
                "provider": "aws",
                "estimated_monthly_cost_usd": 400,
                "payload": {"workload": "erp"},
            },
        )
        self.assertEqual(response.status_code, 403)

    def test_architect_approver_and_operator_flow(self) -> None:
        admin_token = self._login("admin@cloudsizer.local", "CloudSizer123!")
        self._create_user(admin_token, "architect@example.com", "architect")
        self._create_user(admin_token, "approver@example.com", "approver")
        self._create_user(admin_token, "operator@example.com", "operator")

        architect_token = self._login("architect@example.com", "CloudSizer123!")
        approver_token = self._login("approver@example.com", "CloudSizer123!")
        operator_token = self._login("operator@example.com", "CloudSizer123!")

        create_response = self.client.post(
            "/rbac/estimations",
            headers=self._auth(architect_token),
            json={
                "title": "CRM sizing",
                "provider": "azure",
                "estimated_monthly_cost_usd": 550,
                "payload": {"workload": "crm"},
            },
        )
        self.assertEqual(create_response.status_code, 200)

        list_response = self.client.get("/rbac/estimations", headers=self._auth(approver_token))
        self.assertEqual(list_response.status_code, 200)
        estimation_id = list_response.json()["items"][0]["id"]

        approve_response = self.client.post(
            f"/rbac/estimations/{estimation_id}/approve",
            headers=self._auth(approver_token),
        )
        self.assertEqual(approve_response.status_code, 200)

        allocate_response = self.client.post(
            f"/rbac/estimations/{estimation_id}/allocate",
            headers=self._auth(operator_token),
        )
        self.assertEqual(allocate_response.status_code, 200)

        logs_response = self.client.get(
            "/rbac/audit-logs",
            headers=self._auth(admin_token),
        )
        self.assertEqual(logs_response.status_code, 200)
        actions = {item["action"]: item for item in logs_response.json()["items"]}
        self.assertEqual(actions["approve_request"]["resource_id"], str(estimation_id))
        self.assertEqual(actions["approve_request"]["metadata"]["approved_by"], "approver@example.com")
        self.assertEqual(actions["allocate_resources"]["metadata"]["triggered_by"], "operator@example.com")

    def test_finops_can_view_cost_and_logs(self) -> None:
        admin_token = self._login("admin@cloudsizer.local", "CloudSizer123!")
        self._create_user(admin_token, "finops@example.com", "finops")
        self._create_user(admin_token, "architect@example.com", "architect")
        architect_token = self._login("architect@example.com", "CloudSizer123!")
        finops_token = self._login("finops@example.com", "CloudSizer123!")

        self.client.post(
            "/rbac/estimations",
            headers=self._auth(architect_token),
            json={
                "title": "Analytics sizing",
                "provider": "gcp",
                "estimated_monthly_cost_usd": 900,
                "payload": {"workload": "analytics"},
            },
        )

        list_response = self.client.get("/rbac/estimations", headers=self._auth(finops_token))
        estimation_id = list_response.json()["items"][0]["id"]

        cost_response = self.client.get(
            f"/rbac/estimations/{estimation_id}/cost",
            headers=self._auth(finops_token),
        )
        self.assertEqual(cost_response.status_code, 200)
        self.assertEqual(cost_response.json()["estimated_monthly_cost_usd"], 900)

        logs_response = self.client.get("/rbac/audit-logs", headers=self._auth(finops_token))
        self.assertEqual(logs_response.status_code, 200)
        self.assertTrue(any(item["action"] == "create_estimation" for item in logs_response.json()["items"]))

    def test_login_attempts_are_audited_with_metadata(self) -> None:
        failed_login = self.client.post(
            "/rbac/auth/login",
            json={"email": "admin@cloudsizer.local", "password": "wrong-password"},
        )
        self.assertEqual(failed_login.status_code, 401)

        admin_token = self._login("admin@cloudsizer.local", "CloudSizer123!")
        logs_response = self.client.get(
            "/rbac/audit-logs?action=login_attempt",
            headers=self._auth(admin_token),
        )
        self.assertEqual(logs_response.status_code, 200)
        login_events = logs_response.json()["items"]
        self.assertGreaterEqual(len(login_events), 2)
        self.assertIn("timestamp", login_events[0])
        self.assertIn("metadata", login_events[0])
        self.assertTrue(any(item["metadata"]["success"] is False for item in login_events))
        self.assertTrue(any(item["metadata"]["success"] is True for item in login_events))

    def _create_user(self, admin_token: str, email: str, role: str) -> None:
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

    def _login(self, email: str, password: str) -> str:
        response = self.client.post("/rbac/auth/login", json={"email": email, "password": password})
        self.assertEqual(response.status_code, 200)
        return response.json()["access_token"]

    def _auth(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}


if __name__ == "__main__":
    unittest.main()
