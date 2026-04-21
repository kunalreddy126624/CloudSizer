import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from app.allocator.config import AllocatorSettings
from app.allocator.schemas import CloudAccountPlan, TerraformBundle, TerraformBundleFile
from app.models import CloudProvider, ResourceAllocatorRequest, ServiceEstimate
from app.services.catalog import get_catalog_service
from app.services.pricing import build_architecture


SUPPORTED_LIVE_PROVIDERS = {
    CloudProvider.AWS,
    CloudProvider.AZURE,
    CloudProvider.GCP,
}


class TerraformTemplateEngine:
    def __init__(self, settings: AllocatorSettings) -> None:
        self.settings = settings

    def build_bundle(
        self,
        request: ResourceAllocatorRequest,
        account_plan: CloudAccountPlan | None = None,
    ) -> TerraformBundle:
        target_provider = self._resolve_target_provider(request, account_plan)
        services = self._resolve_services(request, target_provider)
        families = {self._resolve_service_family(target_provider, service) for service in services}
        safe_prefix = self._safe_prefix(request.deployment_request.project, request.deployment_request.env.value)

        files = [
            TerraformBundleFile(
                path="providers.tf",
                content=self._render_provider_block(target_provider),
            ),
            TerraformBundleFile(
                path="variables.tf",
                content=self._render_variables_block(target_provider),
            ),
            TerraformBundleFile(
                path="main.tf",
                content=self._render_main_block(
                    provider=target_provider,
                    request=request,
                    account_plan=account_plan,
                    families=families,
                    safe_prefix=safe_prefix,
                ),
            ),
            TerraformBundleFile(
                path="outputs.tf",
                content=self._render_outputs_block(target_provider),
            ),
            TerraformBundleFile(
                path="terraform.tfvars.json",
                content=json.dumps(
                    self._build_tfvars(
                        provider=target_provider,
                        request=request,
                        account_plan=account_plan,
                        families=families,
                    ),
                    indent=2,
                ),
            ),
        ]
        if target_provider == CloudProvider.AWS:
            files.append(
                TerraformBundleFile(
                    path="lambda_src/handler.py",
                    content=self._render_aws_lambda_handler(),
                )
            )
        return TerraformBundle(
            modules=["network", "identity", "data", "workload"],
            files=files,
        )

    def stage_bundle(self, run_id: int, bundle: TerraformBundle) -> Path:
        destination = self.settings.terraform_artifact_dir / f"run-{run_id}"
        destination.mkdir(parents=True, exist_ok=True)
        for terraform_file in bundle.files:
            path = destination / terraform_file.path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(terraform_file.content, encoding="utf-8")
        return destination

    def apply_bundle(
        self,
        run_id: int,
        bundle: TerraformBundle,
        *,
        runner_enabled: bool,
    ) -> "TerraformExecutionResult":
        destination = self.stage_bundle(run_id, bundle)
        log_path = destination / "terraform-execution.log"

        if not runner_enabled:
            message = "Terraform runner is disabled for this allocator request."
            log_path.write_text(message + "\n", encoding="utf-8")
            return TerraformExecutionResult(
                applied=False,
                artifact_path=destination,
                execution_reference=None,
                log_path=log_path,
                runner_mode="terraform_cli",
                message=message,
            )

        if self.settings.mock_terraform_apply:
            mock_log = (
                f"[{datetime.now(UTC).isoformat()}] mock terraform init\n"
                f"[{datetime.now(UTC).isoformat()}] mock terraform apply -auto-approve\n"
            )
            log_path.write_text(mock_log, encoding="utf-8")
            return TerraformExecutionResult(
                applied=True,
                artifact_path=destination,
                execution_reference=f"mock-terraform-run-{run_id}",
                log_path=log_path,
                runner_mode="mock",
                message=f"Mock Terraform apply completed for run {run_id} at {destination}.",
            )

        terraform_binary = shutil.which(self.settings.terraform_binary)
        if terraform_binary is None:
            if Path(self.settings.terraform_binary).exists():
                terraform_binary = self.settings.terraform_binary
            else:
                message = (
                    f"Terraform binary '{self.settings.terraform_binary}' was not found. "
                    "Install Terraform or set ALLOCATOR_TERRAFORM_BINARY."
                )
                log_path.write_text(message + "\n", encoding="utf-8")
                return TerraformExecutionResult(
                    applied=False,
                    artifact_path=destination,
                    execution_reference=None,
                    log_path=log_path,
                    runner_mode="terraform_cli",
                    message=message,
                )

        init_result = self._run_terraform_command(
            [terraform_binary, "init", "-input=false", "-no-color"],
            destination,
        )
        command_logs = [self._format_command_log("terraform init", init_result)]
        if init_result.returncode != 0:
            log_path.write_text("\n\n".join(command_logs), encoding="utf-8")
            return TerraformExecutionResult(
                applied=False,
                artifact_path=destination,
                execution_reference=None,
                log_path=log_path,
                runner_mode="terraform_cli",
                message="Terraform init failed. Review terraform-execution.log for details.",
            )

        apply_result = self._run_terraform_command(
            [terraform_binary, "apply", "-auto-approve", "-input=false", "-no-color"],
            destination,
        )
        command_logs.append(self._format_command_log("terraform apply", apply_result))
        log_path.write_text("\n\n".join(command_logs), encoding="utf-8")
        if apply_result.returncode != 0:
            return TerraformExecutionResult(
                applied=False,
                artifact_path=destination,
                execution_reference=None,
                log_path=log_path,
                runner_mode="terraform_cli",
                message="Terraform apply failed. Review terraform-execution.log for details.",
            )

        return TerraformExecutionResult(
            applied=True,
            artifact_path=destination,
            execution_reference=f"terraform-run-{run_id}",
            log_path=log_path,
            runner_mode="terraform_cli",
            message=f"Terraform apply completed successfully for run {run_id} at {destination}.",
        )

    def _render_provider_block(self, provider: CloudProvider) -> str:
        required_providers = [
            '    random = {',
            '      source  = "hashicorp/random"',
            '      version = ">= 3.6.0"',
            "    }",
        ]
        provider_blocks: list[str] = []

        if provider == CloudProvider.AWS:
            required_providers.extend(
                [
                    '    aws = {',
                    '      source  = "hashicorp/aws"',
                    '      version = ">= 5.0.0"',
                    "    }",
                    '    archive = {',
                    '      source  = "hashicorp/archive"',
                    '      version = ">= 2.5.0"',
                    "    }",
                ]
            )
            provider_blocks.append(
                'provider "aws" {\n'
                "  region = var.region\n"
                "}"
            )
        elif provider == CloudProvider.AZURE:
            required_providers.extend(
                [
                    '    azurerm = {',
                    '      source  = "hashicorp/azurerm"',
                    '      version = ">= 4.0.0"',
                    "    }",
                ]
            )
            provider_blocks.append(
                'provider "azurerm" {\n'
                "  features {}\n"
                "  subscription_id = var.azure_subscription_id != \"\" ? var.azure_subscription_id : null\n"
                "}"
            )
        elif provider == CloudProvider.GCP:
            required_providers.extend(
                [
                    '    google = {',
                    '      source  = "hashicorp/google"',
                    '      version = ">= 6.0.0"',
                    "    }",
                ]
            )
            provider_blocks.append(
                'provider "google" {\n'
                "  project = var.gcp_project_id\n"
                "  region  = var.region\n"
                "}"
            )

        return (
            "terraform {\n"
            '  required_version = ">= 1.6.0"\n\n'
            "  required_providers {\n"
            + "\n".join(required_providers)
            + "\n  }\n"
            "}\n\n"
            + "\n\n".join(provider_blocks)
            + ("\n" if provider_blocks else "")
        )

    def _render_variables_block(self, provider: CloudProvider) -> str:
        base = """variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "owner" {
  type = string
}

variable "region" {
  type = string
}

variable "public_ingress_required" {
  type    = bool
  default = false
}

variable "enable_managed_database" {
  type    = bool
  default = false
}

variable "storage_gb" {
  type    = number
  default = 20
}

variable "db_name" {
  type    = string
  default = "appdb"
}
"""
        if provider == CloudProvider.AZURE:
            base += """
variable "azure_subscription_id" {
  type    = string
  default = ""
}
"""
        if provider == CloudProvider.GCP:
            base += """
variable "gcp_project_id" {
  type = string
}
"""
        return base

    def _render_main_block(
        self,
        *,
        provider: CloudProvider,
        request: ResourceAllocatorRequest,
        account_plan: CloudAccountPlan | None,
        families: set[str],
        safe_prefix: str,
    ) -> str:
        if provider not in SUPPORTED_LIVE_PROVIDERS:
            return self._render_unsupported_provider_block(provider)

        common_header = f"""locals {{
  name_prefix = "{safe_prefix}"
  common_tags = {{
    env         = var.environment
    owner       = var.owner
    project     = var.project
    cost_center = {json.dumps(request.deployment_request.additional_tags.get("cost_center", "allocator"))}
  }}
}}

resource "random_string" "suffix" {{
  length  = 6
  lower   = true
  upper   = false
  numeric = true
  special = false
}}
"""
        if provider == CloudProvider.AWS:
            return common_header + self._render_aws_resources(families)
        if provider == CloudProvider.AZURE:
            return common_header + self._render_azure_resources(families)
        return common_header + self._render_gcp_resources(families, account_plan)

    def _render_outputs_block(self, provider: CloudProvider) -> str:
        if provider == CloudProvider.AWS:
            return """output "app_endpoint" {
  value = aws_lambda_function_url.app.function_url
}

output "storage_bucket_name" {
  value = aws_s3_bucket.assets.bucket
}

output "database_endpoint" {
  value = try(aws_db_instance.database[0].address, null)
}
"""
        if provider == CloudProvider.AZURE:
            return """output "app_endpoint" {
  value = "https://${azurerm_linux_web_app.app.default_hostname}"
}

output "storage_account_name" {
  value = azurerm_storage_account.assets.name
}

output "database_endpoint" {
  value = try(azurerm_postgresql_flexible_server.database[0].fqdn, null)
}
"""
        if provider == CloudProvider.GCP:
            return """output "app_endpoint" {
  value = google_cloud_run_v2_service.app.uri
}

output "storage_bucket_name" {
  value = google_storage_bucket.assets.name
}

output "database_connection_name" {
  value = try(google_sql_database_instance.database[0].connection_name, null)
}
"""
        return """output "unsupported_provider" {
  value = "Live provisioning is not implemented for this provider."
}
"""

    def _render_aws_resources(self, families: set[str]) -> str:
        database_enabled = "true" if "relational_database" in families else "var.enable_managed_database"
        return f"""
data "archive_file" "lambda_zip" {{
  type        = "zip"
  source_dir  = "${{path.module}}/lambda_src"
  output_path = "${{path.module}}/lambda_src.zip"
}}

resource "aws_s3_bucket" "assets" {{
  bucket        = "${{local.name_prefix}}-${{random_string.suffix.result}}-assets"
  force_destroy = true
  tags          = local.common_tags
}}

resource "aws_s3_bucket_public_access_block" "assets" {{
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = !var.public_ingress_required
  block_public_policy     = !var.public_ingress_required
  ignore_public_acls      = !var.public_ingress_required
  restrict_public_buckets = !var.public_ingress_required
}}

resource "aws_iam_role" "lambda_exec" {{
  name = "${{local.name_prefix}}-${{random_string.suffix.result}}-lambda-role"

  assume_role_policy = jsonencode({{
    Version = "2012-10-17"
    Statement = [{{
      Effect = "Allow"
      Principal = {{
        Service = "lambda.amazonaws.com"
      }}
      Action = "sts:AssumeRole"
    }}]
  }})

  tags = local.common_tags
}}

resource "aws_iam_role_policy_attachment" "lambda_basic" {{
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}}

resource "aws_cloudwatch_log_group" "app" {{
  name              = "/aws/lambda/${{local.name_prefix}}-${{random_string.suffix.result}}"
  retention_in_days = 14
  tags              = local.common_tags
}}

resource "aws_lambda_function" "app" {{
  function_name    = "${{local.name_prefix}}-${{random_string.suffix.result}}"
  role             = aws_iam_role.lambda_exec.arn
  runtime          = "python3.12"
  handler          = "handler.handler"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  environment {{
    variables = {{
      PROJECT_NAME   = var.project
      ENVIRONMENT    = var.environment
      STORAGE_BUCKET = aws_s3_bucket.assets.bucket
    }}
  }}

  tags = local.common_tags
}}

resource "aws_lambda_function_url" "app" {{
  function_name      = aws_lambda_function.app.function_name
  authorization_type = var.public_ingress_required ? "NONE" : "AWS_IAM"
}}

resource "random_password" "database" {{
  count   = {database_enabled} ? 1 : 0
  length  = 24
  special = false
}}

data "aws_vpc" "default" {{
  count   = {database_enabled} ? 1 : 0
  default = true
}}

data "aws_subnets" "default" {{
  count = {database_enabled} ? 1 : 0

  filter {{
    name   = "vpc-id"
    values = [data.aws_vpc.default[0].id]
  }}
}}

resource "aws_security_group" "database" {{
  count       = {database_enabled} ? 1 : 0
  name        = "${{local.name_prefix}}-${{random_string.suffix.result}}-db"
  description = "Allocator managed database access"
  vpc_id      = data.aws_vpc.default[0].id

  ingress {{
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = var.public_ingress_required ? ["0.0.0.0/0"] : [data.aws_vpc.default[0].cidr_block]
  }}

  egress {{
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }}

  tags = local.common_tags
}}

resource "aws_db_subnet_group" "database" {{
  count      = {database_enabled} ? 1 : 0
  name       = "${{local.name_prefix}}-${{random_string.suffix.result}}-db-subnets"
  subnet_ids = data.aws_subnets.default[0].ids
  tags       = local.common_tags
}}

resource "aws_db_instance" "database" {{
  count                   = {database_enabled} ? 1 : 0
  identifier              = "${{local.name_prefix}}-${{random_string.suffix.result}}-db"
  allocated_storage       = max(20, tonumber(var.storage_gb))
  engine                  = "postgres"
  engine_version          = "15"
  instance_class          = "db.t3.micro"
  db_name                 = var.db_name
  username                = "allocator"
  password                = random_password.database[0].result
  skip_final_snapshot     = true
  deletion_protection     = false
  publicly_accessible     = var.public_ingress_required
  apply_immediately       = true
  db_subnet_group_name    = aws_db_subnet_group.database[0].name
  vpc_security_group_ids  = [aws_security_group.database[0].id]
  backup_retention_period = 0
  tags                    = local.common_tags
}}
"""

    def _render_azure_resources(self, families: set[str]) -> str:
        database_enabled = "true" if "relational_database" in families else "var.enable_managed_database"
        return f"""
resource "azurerm_resource_group" "main" {{
  name     = "rg-${{local.name_prefix}}-${{random_string.suffix.result}}"
  location = var.region
  tags     = local.common_tags
}}

resource "azurerm_storage_account" "assets" {{
  name                          = substr(replace("${{local.name_prefix}}${{random_string.suffix.result}}sa", "-", ""), 0, 24)
  resource_group_name           = azurerm_resource_group.main.name
  location                      = azurerm_resource_group.main.location
  account_tier                  = "Standard"
  account_replication_type      = "LRS"
  min_tls_version               = "TLS1_2"
  allow_nested_items_to_be_public = var.public_ingress_required
  tags                          = local.common_tags
}}

resource "azurerm_storage_container" "assets" {{
  name                  = "assets"
  storage_account_id    = azurerm_storage_account.assets.id
  container_access_type = var.public_ingress_required ? "blob" : "private"
}}

resource "azurerm_service_plan" "app" {{
  name                = "asp-${{local.name_prefix}}-${{random_string.suffix.result}}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = "B1"
}}

resource "azurerm_linux_web_app" "app" {{
  name                = "app-${{local.name_prefix}}-${{random_string.suffix.result}}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.app.id
  https_only          = true
  tags                = local.common_tags

  identity {{
    type = "SystemAssigned"
  }}

  site_config {{
    always_on = false

    application_stack {{
      python_version = "3.12"
    }}
  }}

  app_settings = {{
    PROJECT_NAME    = var.project
    ENVIRONMENT     = var.environment
    STORAGE_ACCOUNT = azurerm_storage_account.assets.name
  }}
}}

resource "random_password" "database" {{
  count   = {database_enabled} ? 1 : 0
  length  = 24
  special = false
}}

resource "azurerm_postgresql_flexible_server" "database" {{
  count                          = {database_enabled} ? 1 : 0
  name                           = "pg-${{local.name_prefix}}-${{random_string.suffix.result}}"
  resource_group_name            = azurerm_resource_group.main.name
  location                       = azurerm_resource_group.main.location
  administrator_login            = "allocatoradmin"
  administrator_password         = random_password.database[0].result
  backup_retention_days          = 7
  public_network_access_enabled  = var.public_ingress_required
  sku_name                       = "B_Standard_B1ms"
  storage_mb                     = max(32768, tonumber(var.storage_gb) * 1024)
  version                        = "14"
  zone                           = "1"
  tags                           = local.common_tags
}}

resource "azurerm_postgresql_flexible_server_database" "app" {{
  count     = {database_enabled} ? 1 : 0
  name      = var.db_name
  server_id = azurerm_postgresql_flexible_server.database[0].id
  charset   = "UTF8"
  collation = "en_US.utf8"
}}
"""

    def _render_gcp_resources(
        self,
        families: set[str],
        account_plan: CloudAccountPlan | None,
    ) -> str:
        _ = account_plan
        database_enabled = "true" if "relational_database" in families else "var.enable_managed_database"
        return f"""
check "gcp_project_id_present" {{
  assert {{
    condition     = var.gcp_project_id != ""
    error_message = "gcp_project_id must be set to provision live Google Cloud resources."
  }}
}}

locals {{
  common_labels = {{
    env     = var.environment
    owner   = regexreplace(lower(var.owner), "[^a-z0-9_-]", "-")
    project = regexreplace(lower(var.project), "[^a-z0-9_-]", "-")
  }}
}}

resource "google_storage_bucket" "assets" {{
  name                        = "${{local.name_prefix}}-${{random_string.suffix.result}}-assets"
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true
  labels                      = local.common_labels
}}

resource "google_service_account" "app" {{
  account_id   = substr("app-${{local.name_prefix}}-${{random_string.suffix.result}}", 0, 30)
  display_name = "${{var.project}} allocator runtime"
}}

resource "google_cloud_run_v2_service" "app" {{
  name                = "app-${{local.name_prefix}}-${{random_string.suffix.result}}"
  location            = var.region
  deletion_protection = false
  ingress             = var.public_ingress_required ? "INGRESS_TRAFFIC_ALL" : "INGRESS_TRAFFIC_INTERNAL_ONLY"
  labels              = local.common_labels

  template {{
    service_account = google_service_account.app.email

    containers {{
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      env {{
        name  = "PROJECT_NAME"
        value = var.project
      }}

      env {{
        name  = "STORAGE_BUCKET"
        value = google_storage_bucket.assets.name
      }}
    }}
  }}
}}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {{
  count    = var.public_ingress_required ? 1 : 0
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}}

resource "random_password" "database" {{
  count   = {database_enabled} ? 1 : 0
  length  = 24
  special = false
}}

resource "google_sql_database_instance" "database" {{
  count               = {database_enabled} ? 1 : 0
  name                = "pg-${{local.name_prefix}}-${{random_string.suffix.result}}"
  database_version    = "POSTGRES_15"
  region              = var.region
  deletion_protection = false

  settings {{
    tier              = "db-f1-micro"
    disk_size         = max(20, tonumber(var.storage_gb))
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"

    ip_configuration {{
      ipv4_enabled = var.public_ingress_required
    }}

    user_labels = local.common_labels
  }}
}}

resource "google_sql_user" "app" {{
  count    = {database_enabled} ? 1 : 0
  name     = "allocator"
  instance = google_sql_database_instance.database[0].name
  password = random_password.database[0].result
}}

resource "google_sql_database" "app" {{
  count    = {database_enabled} ? 1 : 0
  name     = var.db_name
  instance = google_sql_database_instance.database[0].name
}}
"""

    def _render_unsupported_provider_block(self, provider: CloudProvider) -> str:
        return f"""resource "terraform_data" "unsupported_provider" {{
  input = {{
    requested_provider = "{provider.value}"
  }}

  lifecycle {{
    precondition {{
      condition     = false
      error_message = "Live provisioning is currently supported only for aws, azure, and gcp. Requested provider: {provider.value}."
    }}
  }}
}}
"""

    def _build_tfvars(
        self,
        *,
        provider: CloudProvider,
        request: ResourceAllocatorRequest,
        account_plan: CloudAccountPlan | None,
        families: set[str],
    ) -> dict[str, object]:
        tfvars: dict[str, object] = {
            "project": request.deployment_request.project,
            "environment": request.deployment_request.env.value,
            "owner": request.deployment_request.owner,
            "region": request.deployment_request.region,
            "public_ingress_required": request.deployment_request.public_ingress_required,
            "enable_managed_database": (
                "relational_database" in families
                or request.approved_estimation.baseline_request.requires_managed_database
            ),
            "storage_gb": request.approved_estimation.baseline_request.storage_gb,
            "db_name": "appdb",
        }
        if provider == CloudProvider.AZURE:
            tfvars["azure_subscription_id"] = self._resolve_account_scope_id(account_plan)
        if provider == CloudProvider.GCP:
            tfvars["gcp_project_id"] = self._resolve_account_scope_id(account_plan)
        return tfvars

    def _resolve_target_provider(
        self,
        request: ResourceAllocatorRequest,
        account_plan: CloudAccountPlan | None,
    ) -> CloudProvider:
        if account_plan is not None:
            return account_plan.provider
        services = self._resolve_requested_services(request)
        for service in services:
            if service.provider is not None and self._is_compute_service(service):
                return service.provider
        for service in services:
            if service.provider is not None:
                return service.provider
        return request.approved_estimation.recommended_provider

    def _resolve_services(
        self,
        request: ResourceAllocatorRequest,
        provider: CloudProvider,
    ) -> list[ServiceEstimate]:
        services = [
            service
            for service in self._resolve_requested_services(request)
            if service.provider in {None, provider}
        ]
        if services:
            return services
        return build_architecture(
            request.approved_estimation.baseline_request,
            provider,
        ).services

    def _resolve_requested_services(
        self,
        request: ResourceAllocatorRequest,
    ) -> list[ServiceEstimate]:
        if request.approved_estimation.approved_services:
            return request.approved_estimation.approved_services
        return build_architecture(
            request.approved_estimation.baseline_request,
            request.approved_estimation.recommended_provider,
        ).services

    def _resolve_service_family(
        self,
        provider: CloudProvider,
        service: ServiceEstimate,
    ) -> str:
        if service.service_code:
            try:
                return get_catalog_service(provider, service.service_code).service_family
            except KeyError:
                pass

        label = f"{service.name} {service.purpose}".lower()
        if any(keyword in label for keyword in ("sql", "postgres", "mysql", "database", "aurora", "d1", "cloud sql")):
            return "relational_database"
        if any(keyword in label for keyword in ("storage", "backup", "bucket", "blob", "r2", "s3")):
            return "object_storage"
        if any(keyword in label for keyword in ("cdn", "front door", "cloudfront", "edge", "load balancer")):
            return "content_delivery"
        if any(keyword in label for keyword in ("container", "kubernetes", "fargate", "ecs")):
            return "containers_managed"
        if any(keyword in label for keyword in ("lambda", "function", "run", "workers", "app service")):
            return "serverless_runtime"
        return "virtual_machine"

    def _resolve_account_scope_id(self, account_plan: CloudAccountPlan | None) -> str:
        if account_plan is None:
            return ""
        return (
            account_plan.target_account_id
            or account_plan.existing_account_id
            or account_plan.provisioning_reference
            or ""
        )

    def _safe_prefix(self, project: str, environment: str) -> str:
        combined = f"{project}-{environment}".lower()
        return re.sub(r"[^a-z0-9-]+", "-", combined).strip("-")[:20] or "allocator"

    def _is_compute_service(self, service: ServiceEstimate) -> bool:
        label = f"{service.name} {service.purpose}".lower()
        return any(
            keyword in label
            for keyword in (
                "compute",
                "container",
                "kubernetes",
                "runtime",
                "app service",
                "workers",
                "engine",
                "instance",
                "vm",
                "lambda",
                "function",
                "run",
            )
        )

    def _render_aws_lambda_handler(self) -> str:
        return """import json


def handler(event, context):
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(
            {
                "service": "allocator-app",
                "message": "Provisioned by the allocator",
            }
        ),
    }
"""

    def _run_terraform_command(self, command: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
        env = dict(os.environ)
        env["TF_IN_AUTOMATION"] = "1"
        return subprocess.run(
            command,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=self.settings.terraform_apply_timeout_seconds,
            check=False,
            env=env,
        )

    def _format_command_log(self, label: str, result: subprocess.CompletedProcess[str]) -> str:
        return (
            f"$ {label}\n"
            f"exit_code={result.returncode}\n"
            f"stdout:\n{result.stdout.strip() or '<empty>'}\n"
            f"stderr:\n{result.stderr.strip() or '<empty>'}"
        )


@dataclass(frozen=True)
class TerraformExecutionResult:
    applied: bool
    artifact_path: Path
    execution_reference: str | None
    log_path: Path | None
    runner_mode: str
    message: str
