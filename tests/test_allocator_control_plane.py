import os
import tempfile
import unittest
from pathlib import Path

from app.allocator.control_plane import AllocatorControlPlane
from app.allocator.schemas import (
    AllocationActionRequest,
    AllocatorRunCreateRequest,
    ApprovalActionRequest,
    BudgetValidationActionRequest,
)
from app.models import ResourceAllocatorRequest
from app.rbac.schemas import PermissionName, Principal, RoleName


class AllocatorControlPlaneTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_env = {
            "ALLOCATOR_DATABASE_URL": os.getenv("ALLOCATOR_DATABASE_URL"),
            "ALLOCATOR_TERRAFORM_ARTIFACT_DIR": os.getenv("ALLOCATOR_TERRAFORM_ARTIFACT_DIR"),
            "ALLOCATOR_MOCK_CLOUD_CONTROL_PLANE": os.getenv("ALLOCATOR_MOCK_CLOUD_CONTROL_PLANE"),
            "ALLOCATOR_MOCK_TERRAFORM_APPLY": os.getenv("ALLOCATOR_MOCK_TERRAFORM_APPLY"),
        }
        os.environ["ALLOCATOR_DATABASE_URL"] = f"sqlite:///{Path(self.temp_dir.name) / 'allocator.db'}"
        os.environ["ALLOCATOR_TERRAFORM_ARTIFACT_DIR"] = str(Path(self.temp_dir.name) / "artifacts")
        os.environ["ALLOCATOR_MOCK_CLOUD_CONTROL_PLANE"] = "true"
        os.environ["ALLOCATOR_MOCK_TERRAFORM_APPLY"] = "true"
        self.control_plane = AllocatorControlPlane()

    def tearDown(self) -> None:
        for key, value in self.original_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.temp_dir.cleanup()

    def test_submit_run_waits_for_approval_for_azure(self) -> None:
        response = self.control_plane.submit_run(
            AllocatorRunCreateRequest(
                requested_by="engineer",
                change_reason="Validate azure staging flow.",
                payload=self._build_request("azure"),
            ),
            self._principal(
                "architect@example.com",
                [RoleName.ARCHITECT],
                [PermissionName.CREATE_ESTIMATION],
            ),
        )

        self.assertEqual(response.run.status.value, "awaiting_approval")
        self.assertEqual(response.run.account_plan.provider.value, "azure")
        self.assertEqual(response.run.account_plan.resource_kind, "subscription")
        self.assertTrue(response.run.policy_result.passed)

    def test_approve_run_waits_for_budget_validation_and_operator(self) -> None:
        submitted = self.control_plane.submit_run(
            AllocatorRunCreateRequest(
                requested_by="engineer",
                change_reason="Validate cloudflare edge flow.",
                payload=self._build_request("cloudflare"),
            ),
            self._principal(
                "architect@example.com",
                [RoleName.ARCHITECT],
                [PermissionName.CREATE_ESTIMATION],
            ),
        )

        approved = self.control_plane.approve_run(
            submitted.run.id,
            ApprovalActionRequest(reviewer="architect", comment="approved"),
            self._principal(
                "approver@example.com",
                [RoleName.APPROVER],
                [PermissionName.APPROVE_REQUEST],
            ),
        )

        self.assertEqual(approved.run.status.value, "approved")
        self.assertEqual(approved.run.approval_status.value, "approved")
        self.assertEqual(approved.run.budget_validation_status.value, "pending")
        self.assertIsNone(approved.run.provisioning_result)
        self.assertIn("Waiting for FINOPS budget validation", approved.run.summary)

    def test_reject_run_marks_status(self) -> None:
        submitted = self.control_plane.submit_run(
            AllocatorRunCreateRequest(
                requested_by="engineer",
                change_reason="Validate rejection flow.",
                payload=self._build_request("gcp"),
            ),
            self._principal(
                "architect@example.com",
                [RoleName.ARCHITECT],
                [PermissionName.CREATE_ESTIMATION],
            ),
        )

        rejected = self.control_plane.reject_run(
            submitted.run.id,
            ApprovalActionRequest(reviewer="architect", comment="needs changes"),
            self._principal(
                "approver@example.com",
                [RoleName.APPROVER],
                [PermissionName.REJECT_REQUEST],
            ),
        )

        self.assertEqual(rejected.run.status.value, "rejected")
        self.assertEqual(rejected.run.approval_status.value, "rejected")
        self.assertIn("needs changes", rejected.run.error_message or "")
        self.assertEqual(rejected.run.budget_validation_status.value, "rejected")

    def test_allocate_run_requires_finops_budget_validation(self) -> None:
        submitted = self.control_plane.submit_run(
            AllocatorRunCreateRequest(
                requested_by="engineer",
                change_reason="Validate pre-check gating.",
                payload=self._build_request("aws"),
            ),
            self._principal(
                "architect@example.com",
                [RoleName.ARCHITECT],
                [PermissionName.CREATE_ESTIMATION],
            ),
        )
        approved = self.control_plane.approve_run(
            submitted.run.id,
            ApprovalActionRequest(reviewer="architect", comment="approved"),
            self._principal(
                "approver@example.com",
                [RoleName.APPROVER],
                [PermissionName.APPROVE_REQUEST],
            ),
        )

        with self.assertRaises(ValueError):
            self.control_plane.allocate_run(
                approved.run.id,
                AllocationActionRequest(operator="operator", comment="trigger apply"),
                self._principal(
                    "operator@example.com",
                    [RoleName.OPERATOR],
                    [PermissionName.ALLOCATE_RESOURCES],
                ),
            )

    def test_operator_can_allocate_after_finops_validation(self) -> None:
        submitted = self.control_plane.submit_run(
            AllocatorRunCreateRequest(
                requested_by="engineer",
                change_reason="Validate secured allocation flow.",
                payload=self._build_request("cloudflare"),
            ),
            self._principal(
                "architect@example.com",
                [RoleName.ARCHITECT],
                [PermissionName.CREATE_ESTIMATION],
            ),
        )
        approved = self.control_plane.approve_run(
            submitted.run.id,
            ApprovalActionRequest(reviewer="architect", comment="approved"),
            self._principal(
                "approver@example.com",
                [RoleName.APPROVER],
                [PermissionName.APPROVE_REQUEST],
            ),
        )
        budget_validated = self.control_plane.validate_budget(
            approved.run.id,
            BudgetValidationActionRequest(reviewer="finops", comment="budget cleared"),
            self._principal(
                "finops@example.com",
                [RoleName.FINOPS],
                [PermissionName.VIEW_COST],
            ),
        )

        allocated = self.control_plane.allocate_run(
            budget_validated.run.id,
            AllocationActionRequest(operator="operator", comment="trigger apply"),
            self._principal(
                "operator@example.com",
                [RoleName.OPERATOR],
                [PermissionName.ALLOCATE_RESOURCES],
            ),
        )

        self.assertEqual(allocated.run.status.value, "completed")
        self.assertTrue(allocated.run.provisioning_result.applied)
        self.assertEqual(allocated.run.provisioning_result.runner_mode, "mock")
        self.assertEqual(allocated.run.account_plan.provider.value, "cloudflare")
        artifact_path = Path(allocated.run.provisioning_result.terraform_artifact_path or "")
        self.assertTrue(artifact_path.exists())
        self.assertTrue((artifact_path / "main.tf").exists())
        self.assertTrue(Path(allocated.run.provisioning_result.execution_log_path or "").exists())

    def test_allocate_run_fails_cleanly_when_terraform_binary_is_missing(self) -> None:
        os.environ["ALLOCATOR_MOCK_TERRAFORM_APPLY"] = "false"
        self.control_plane = AllocatorControlPlane()

        submitted = self.control_plane.submit_run(
            AllocatorRunCreateRequest(
                requested_by="engineer",
                change_reason="Validate live apply failure handling.",
                payload=self._build_request("aws"),
            ),
            self._principal(
                "architect@example.com",
                [RoleName.ARCHITECT],
                [PermissionName.CREATE_ESTIMATION],
            ),
        )
        approved = self.control_plane.approve_run(
            submitted.run.id,
            ApprovalActionRequest(reviewer="architect", comment="approved"),
            self._principal(
                "approver@example.com",
                [RoleName.APPROVER],
                [PermissionName.APPROVE_REQUEST],
            ),
        )
        budget_validated = self.control_plane.validate_budget(
            approved.run.id,
            BudgetValidationActionRequest(reviewer="finops", comment="budget cleared"),
            self._principal(
                "finops@example.com",
                [RoleName.FINOPS],
                [PermissionName.VIEW_COST],
            ),
        )

        allocated = self.control_plane.allocate_run(
            budget_validated.run.id,
            AllocationActionRequest(operator="operator", comment="trigger apply"),
            self._principal(
                "operator@example.com",
                [RoleName.OPERATOR],
                [PermissionName.ALLOCATE_RESOURCES],
            ),
        )

        self.assertEqual(allocated.run.status.value, "failed")
        self.assertFalse(allocated.run.provisioning_result.applied)
        self.assertIn("Terraform binary", allocated.run.provisioning_result.message)
        self.assertTrue(Path(allocated.run.provisioning_result.execution_log_path or "").exists())

    def test_requester_cannot_self_approve(self) -> None:
        submitted = self.control_plane.submit_run(
            AllocatorRunCreateRequest(
                requested_by="architect@example.com",
                change_reason="Validate self-approval block.",
                payload=self._build_request("aws"),
            ),
            self._principal(
                "architect@example.com",
                [RoleName.ADMIN],
                [PermissionName.CREATE_ESTIMATION],
            ),
        )

        with self.assertRaises(PermissionError):
            self.control_plane.approve_run(
                submitted.run.id,
                ApprovalActionRequest(reviewer="architect@example.com", comment="approved"),
                self._principal(
                    "architect@example.com",
                    [RoleName.APPROVER],
                    [PermissionName.APPROVE_REQUEST],
                ),
            )

    def _build_request(self, provider: str) -> ResourceAllocatorRequest:
        return ResourceAllocatorRequest.model_validate(
            {
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
            }
        )

    def _principal(
        self,
        email: str,
        roles: list[RoleName],
        permissions: list[PermissionName],
    ) -> Principal:
        return Principal(sub=1, email=email, roles=roles, permissions=permissions)


if __name__ == "__main__":
    unittest.main()
