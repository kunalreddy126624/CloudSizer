import json
import tempfile
import unittest
from pathlib import Path

from app.allocator.config import AllocatorSettings
from app.allocator.schemas import CloudAccountPlan
from app.allocator.services.terraform import TerraformTemplateEngine
from app.models import CloudProvider, ResourceAllocatorRequest


class AllocatorTerraformTemplateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.engine = TerraformTemplateEngine(
            AllocatorSettings(
                database_url=f"sqlite:///{Path(self.temp_dir.name) / 'allocator.db'}",
                audit_retention_days=90,
                default_currency="USD",
                terraform_state_bucket="allocator-state",
                terraform_artifact_dir=Path(self.temp_dir.name) / "artifacts",
                terraform_binary="terraform",
                terraform_apply_timeout_seconds=900,
                aws_region="us-east-1",
                default_account_email_domain="allocator.local",
                mock_cloud_control_plane=True,
                mock_terraform_apply=True,
                approval_required=True,
                redis_url=None,
            )
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_aws_bundle_contains_real_resources(self) -> None:
        bundle = self.engine.build_bundle(
            self._build_request("aws", "ap-south-1"),
            self._account_plan(CloudProvider.AWS, existing_account_id="123456789012"),
        )

        providers_tf = self._file(bundle, "providers.tf")
        main_tf = self._file(bundle, "main.tf")

        self.assertIn('provider "aws"', providers_tf)
        self.assertIn('resource "aws_s3_bucket" "assets"', main_tf)
        self.assertIn('resource "aws_lambda_function" "app"', main_tf)
        self.assertIn('resource "aws_db_instance" "database"', main_tf)

    def test_azure_bundle_contains_real_resources(self) -> None:
        bundle = self.engine.build_bundle(
            self._build_request("azure", "eastus"),
            self._account_plan(CloudProvider.AZURE, existing_account_id="00000000-0000-0000-0000-000000000000"),
        )

        providers_tf = self._file(bundle, "providers.tf")
        main_tf = self._file(bundle, "main.tf")
        tfvars = json.loads(self._file(bundle, "terraform.tfvars.json"))

        self.assertIn('provider "azurerm"', providers_tf)
        self.assertIn('resource "azurerm_storage_account" "assets"', main_tf)
        self.assertIn('resource "azurerm_linux_web_app" "app"', main_tf)
        self.assertIn('resource "azurerm_postgresql_flexible_server" "database"', main_tf)
        self.assertEqual(tfvars["azure_subscription_id"], "00000000-0000-0000-0000-000000000000")

    def test_gcp_bundle_contains_real_resources(self) -> None:
        bundle = self.engine.build_bundle(
            self._build_request("gcp", "us-central1"),
            self._account_plan(CloudProvider.GCP, existing_account_id="allocator-project-123"),
        )

        providers_tf = self._file(bundle, "providers.tf")
        main_tf = self._file(bundle, "main.tf")
        tfvars = json.loads(self._file(bundle, "terraform.tfvars.json"))

        self.assertIn('provider "google"', providers_tf)
        self.assertIn('resource "google_storage_bucket" "assets"', main_tf)
        self.assertIn('resource "google_cloud_run_v2_service" "app"', main_tf)
        self.assertIn('resource "google_sql_database_instance" "database"', main_tf)
        self.assertEqual(tfvars["gcp_project_id"], "allocator-project-123")

    def test_unsupported_provider_fails_explicitly(self) -> None:
        bundle = self.engine.build_bundle(
            self._build_request("cloudflare", "global"),
            self._account_plan(CloudProvider.CLOUDFLARE, existing_account_id="cf-account"),
        )

        main_tf = self._file(bundle, "main.tf")
        self.assertIn("Live provisioning is currently supported only for aws, azure, and gcp.", main_tf)

    def _file(self, bundle, path: str) -> str:
        return next(item.content for item in bundle.files if item.path == path)

    def _account_plan(self, provider: CloudProvider, existing_account_id: str) -> CloudAccountPlan:
        return CloudAccountPlan(
            provider=provider,
            reuse_existing=True,
            resource_kind="account",
            account_name="allocator-test",
            organizational_unit="platform",
            billing_scope="finops",
            existing_account_id=existing_account_id,
            rationale="Use existing account scope.",
        )

    def _build_request(self, provider: str, region: str) -> ResourceAllocatorRequest:
        return ResourceAllocatorRequest.model_validate(
            {
                "approved_estimation": {
                    "approval_reference": "APR-5001",
                    "approved": True,
                    "baseline_request": {
                        "workload_type": "application",
                        "region": region,
                        "user_count": 180,
                        "concurrent_users": 50,
                        "storage_gb": 240,
                        "monthly_requests_million": 2.2,
                        "requires_disaster_recovery": False,
                        "requires_managed_database": True,
                        "availability_tier": "high",
                        "budget_preference": "balanced",
                        "preferred_providers": [provider],
                    },
                    "recommended_provider": provider,
                    "estimated_monthly_cost_usd": 420.0,
                    "approved_services": [],
                    "notes": [],
                },
                "budget_constraints": {"currency": "USD", "max_monthly_cost": 1200},
                "architecture_type": "web_application",
                "organization_context": {
                    "allowed_clouds": ["aws", "azure", "gcp", "cloudflare"],
                    "approved_account_ids": ["shared-platform"],
                    "billing_scope": "finops",
                    "account_vending_enabled": True,
                    "default_parent_org_unit": "platform",
                    "tagging_policy": ["project", "env", "owner"],
                    "iam_boundary_name": "allocator-boundary",
                    "private_network_required": False,
                    "network_guardrails": ["central-logging"],
                    "terraform_runner_enabled": True,
                },
                "deployment_request": {
                    "env": "staging",
                    "region": region,
                    "owner": "platform-team",
                    "project": "allocator-app",
                    "public_ingress_required": False,
                    "approval_to_apply": False,
                    "requires_new_account": False,
                    "additional_tags": {"cost_center": "engineering"},
                },
            }
        )


if __name__ == "__main__":
    unittest.main()
