import tempfile
import unittest
from pathlib import Path

from app.api.routes import allocator_contracts, allocator_execute
from app.models import ResourceAllocatorRequest


def build_request(**overrides) -> ResourceAllocatorRequest:
    payload = {
        "approved_estimation": {
            "approval_reference": "APR-1001",
            "approved": True,
            "baseline_request": {
                "workload_type": "application",
                "region": "ap-south-1",
                "user_count": 200,
                "concurrent_users": 60,
                "storage_gb": 400,
                "monthly_requests_million": 2.5,
                "requires_disaster_recovery": False,
                "requires_managed_database": True,
                "availability_tier": "high",
                "budget_preference": "balanced",
                "preferred_providers": ["aws"],
            },
            "recommended_provider": "aws",
            "estimated_monthly_cost_usd": 340.0,
        },
        "budget_constraints": {
            "currency": "USD",
            "max_monthly_cost": 600.0,
        },
        "architecture_type": "web_application",
        "organization_context": {
            "allowed_clouds": ["aws", "azure", "gcp"],
            "approved_account_ids": ["aws-shared-prod"],
            "billing_scope": "finops-prod",
            "account_vending_enabled": True,
            "default_parent_org_unit": "ou-production",
            "tagging_policy": ["project", "env", "owner"],
            "iam_boundary_name": "cloudsizer-boundary",
            "private_network_required": True,
            "network_guardrails": ["deny-public-db", "centralized-logging"],
            "terraform_runner_enabled": False,
        },
        "deployment_request": {
            "env": "staging",
            "region": "ap-south-1",
            "owner": "platform-team",
            "project": "cloudsizer",
            "public_ingress_required": False,
            "approval_to_apply": False,
            "existing_account_id": "aws-shared-prod",
            "requires_new_account": False,
            "additional_tags": {"cost_center": "eng"},
        },
    }

    for key, value in overrides.items():
        payload[key] = value

    return ResourceAllocatorRequest.model_validate(payload)


class ResourceAllocatorTest(unittest.TestCase):
    def test_contracts_expose_all_tool_schemas(self) -> None:
        response = allocator_contracts()

        self.assertEqual(len(response.tool_contracts), 5)
        self.assertEqual(
            [contract.name for contract in response.tool_contracts],
            [
                "create_cloud_account",
                "generate_terraform",
                "estimate_cost",
                "validate_policy",
                "apply_terraform",
            ],
        )
        self.assertIn("properties", response.output_schema)

    def test_allocator_returns_needs_approval_when_checks_pass_without_apply(self) -> None:
        response = allocator_execute(build_request())

        self.assertEqual(response.status.value, "needs_approval")
        self.assertTrue(response.policy_validation.passed)
        self.assertFalse(response.provisioning.applied)
        self.assertTrue(response.provisioning.approval_required)
        self.assertEqual(response.account_strategy.action.value, "reuse_existing_account")

    def test_allocator_fails_when_budget_is_exceeded(self) -> None:
        request = build_request(
            budget_constraints={"currency": "USD", "max_monthly_cost": 200.0}
        )

        response = allocator_execute(request)

        self.assertEqual(response.status.value, "failed")
        self.assertFalse(response.policy_validation.passed)
        self.assertTrue(
            any("exceeds the budget limit" in violation for violation in response.policy_validation.violations)
        )

    def test_allocator_stages_bundle_when_apply_is_approved_and_runner_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            request = build_request(
                organization_context={
                    "allowed_clouds": ["aws", "azure", "gcp"],
                    "approved_account_ids": ["aws-shared-prod"],
                    "billing_scope": "finops-prod",
                    "account_vending_enabled": True,
                    "default_parent_org_unit": "ou-production",
                    "tagging_policy": ["project", "env", "owner"],
                    "iam_boundary_name": "cloudsizer-boundary",
                    "private_network_required": True,
                    "network_guardrails": ["deny-public-db", "centralized-logging"],
                    "terraform_runner_enabled": True,
                    "terraform_artifact_root": temp_dir,
                },
                deployment_request={
                    "env": "prod",
                    "region": "ap-south-1",
                    "owner": "platform-team",
                    "project": "cloudsizer",
                    "public_ingress_required": True,
                    "approval_to_apply": True,
                    "requires_new_account": True,
                    "account_name": "cloudsizer-prod",
                    "account_purpose": "production application",
                    "parent_org_unit": "ou-production",
                    "additional_tags": {"cost_center": "eng"},
                },
            )

            response = allocator_execute(request)

            self.assertEqual(response.status.value, "success")
            self.assertTrue(response.provisioning.applied)
            self.assertEqual(response.provisioning.execution_mode, "runner_handoff")
            self.assertEqual(response.account_strategy.action.value, "create_new_account")
            self.assertIsNotNone(response.provisioning.artifact_path)

            artifact_path = Path(response.provisioning.artifact_path or "")
            self.assertTrue(artifact_path.exists())
            self.assertTrue((artifact_path / "main.tf").exists())
            self.assertTrue((artifact_path / "apply.manifest.json").exists())

    def test_allocator_supports_decoupled_compute_with_multi_cloud_services(self) -> None:
        request = build_request(
            approved_estimation={
                "approval_reference": "APR-2200",
                "approved": True,
                "baseline_request": {
                    "workload_type": "application",
                    "region": "us-east-1",
                    "user_count": 260,
                    "concurrent_users": 90,
                    "storage_gb": 600,
                    "monthly_requests_million": 6.0,
                    "requires_disaster_recovery": True,
                    "requires_managed_database": True,
                    "availability_tier": "high",
                    "budget_preference": "balanced",
                    "enable_decoupled_compute": True,
                    "selective_services": [
                        {"service_family": "compute", "provider": "aws"},
                        {"service_family": "database", "provider": "azure"},
                        {"service_family": "edge", "provider": "gcp"},
                    ],
                    "preferred_providers": ["aws", "azure", "gcp"],
                },
                "recommended_provider": "aws",
                "estimated_monthly_cost_usd": 940.0,
                "approved_services": [],
            },
            organization_context={
                "allowed_clouds": ["aws", "azure", "gcp"],
                "approved_account_ids": ["aws-shared-prod"],
                "billing_scope": "finops-prod",
                "account_vending_enabled": True,
                "default_parent_org_unit": "ou-production",
                "tagging_policy": ["project", "env", "owner"],
                "iam_boundary_name": "cloudsizer-boundary",
                "private_network_required": True,
                "network_guardrails": ["deny-public-db", "centralized-logging"],
                "terraform_runner_enabled": False,
            },
            budget_constraints={"currency": "USD", "max_monthly_cost": 2600.0},
        )

        response = allocator_execute(request)

        self.assertEqual(response.status.value, "needs_approval")
        providers = {service.provider.value for service in response.infra_plan.services if service.provider}
        self.assertIn("aws", providers)
        self.assertIn("azure", providers)
        self.assertIn("gcp", providers)
        self.assertTrue(response.policy_validation.passed)


if __name__ == "__main__":
    unittest.main()
